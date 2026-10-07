"""Remove Monte Carlo grain from a diffuse atlas with Blender's bundled OIDN.

Input/output arrays are linear RGB float32. The original raw atlas is retained.
Prefers an available CUDA device, otherwise CPU; requests a 1 GiB memory limit.
"""
import ctypes as c
import os
from pathlib import Path
import numpy as np


def denoise_rgb(rgb, blender_binary):
    folder = Path(blender_binary).parent / 'blender.shared'
    dll_directory = os.add_dll_directory(str(folder)) if os.name == 'nt' else None
    library = folder / ('OpenImageDenoise.dll' if os.name == 'nt' else 'libOpenImageDenoise.so')
    lib = c.CDLL(str(library))
    pointer, size = c.c_void_p, c.c_size_t
    def api(name, arguments, result=None):
        fn = getattr(lib, name); fn.argtypes = arguments; fn.restype = result; return fn
    new_device = api('oidnNewDevice', [c.c_int], pointer)
    commit_device = api('oidnCommitDevice', [pointer])
    get_error = api('oidnGetDeviceError', [pointer, c.POINTER(c.c_char_p)], c.c_int)
    release_device = api('oidnReleaseDevice', [pointer])
    cpu_supported = api('oidnIsCPUDeviceSupported', [], c.c_bool)
    cuda_supported = api('oidnIsCUDADeviceSupported', [c.c_int], c.c_bool)
    device = new_device(3 if cuda_supported(0) else 1)
    def check():
        message = c.c_char_p(); code = get_error(device, c.byref(message))
        if code: raise RuntimeError('OIDN error %s: %s' % (code, message.value))
    commit_device(device); check()
    new_filter = api('oidnNewFilter', [pointer, c.c_char_p], pointer)
    new_buffer = api('oidnNewBuffer', [pointer, size], pointer)
    write_buffer = api('oidnWriteBuffer', [pointer, size, size, pointer])
    read_buffer = api('oidnReadBuffer', [pointer, size, size, pointer])
    image = api('oidnSetFilterImage', [pointer, c.c_char_p, pointer, c.c_int, size, size, size, size, size])
    boolean = api('oidnSetFilterBool', [pointer, c.c_char_p, c.c_bool])
    integer = api('oidnSetFilterInt', [pointer, c.c_char_p, c.c_int])
    commit = api('oidnCommitFilter', [pointer]); execute = api('oidnExecuteFilter', [pointer])
    release_filter = api('oidnReleaseFilter', [pointer]); release_buffer = api('oidnReleaseBuffer', [pointer])
    rgb = np.ascontiguousarray(rgb, dtype=np.float32)
    output = np.empty_like(rgb); height, width, _ = rgb.shape
    buffers = []; filter_handle = None
    try:
        filter_handle = new_filter(device, b'RT'); check()
        for name, array in [(b'color', rgb), (b'output', output)]:
            buffer = new_buffer(device, array.nbytes); buffers.append(buffer); check()
            if name == b'color': write_buffer(buffer, 0, array.nbytes, array.ctypes.data)
            image(filter_handle, name, buffer, 3, width, height, 0, 0, 0)
        boolean(filter_handle, b'hdr', False); boolean(filter_handle, b'srgb', False)
        integer(filter_handle, b'quality', 6); integer(filter_handle, b'maxMemoryMB', 1024)
        commit(filter_handle); check(); execute(filter_handle); check()
        read_buffer(buffers[1], 0, output.nbytes, output.ctypes.data); check()
        # Retain unused black pixels. UV islands have 16px bake gutters.
        unused = np.max(rgb, axis=2) < .001
        output[unused] = rgb[unused]
        return np.clip(output, 0, 1)
    finally:
        if filter_handle: release_filter(filter_handle)
        for buffer in buffers: release_buffer(buffer)
        release_device(device)
        if dll_directory: dll_directory.close()


def denoise_image(image, target):
    import bpy
    if not image.has_data: _ = image.pixels[0]
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba = pixels.reshape(height, width, 4)
    clean = denoise_rgb(rgba[:, :, :3], bpy.app.binary_path)
    rgba[:, :, :3] = clean; rgba[:, :, 3] = 1
    result = bpy.data.images.new('Denoised_'+image.name, width=width, height=height, alpha=False, float_buffer=False)
    try:
        result.colorspace_settings.name = 'sRGB'
        result.pixels.foreach_set(rgba.ravel()); result.update()
        result.file_format = 'PNG'; result.filepath_raw = str(target); result.save()
    finally:
        bpy.data.images.remove(result, do_unlink=True)
    return bpy.data.images.load(str(target), check_existing=False)
