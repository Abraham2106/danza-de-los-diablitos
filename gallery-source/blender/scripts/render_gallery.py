"""Render six cameras. CLI: blender -b gallery.blend -P render_gallery.py -- [--preview] [--camera NAME]

Final output: 3840x2160 PNG (16-bit) and linear half-float EXR masters.
Each final PNG/EXR pair is saved from one render; there is no second render
cost. Preview mode never writes into final output and never saves the .blend.
"""
import bpy
import json
import sys
import time
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
preview = '--preview' in args
resume = '--resume' in args
requested = args[args.index('--camera')+1] if '--camera' in args else None
samples = int(args[args.index('--samples')+1]) if '--samples' in args else (64 if preview else 512)
threshold = float(args[args.index('--threshold')+1]) if '--threshold' in args else (.04 if preview else .01)
if not 1 <= samples <= 8192 or not 0 <= threshold <= 1:
    raise ValueError('Samples must be 1..8192, threshold must be 0..1')
scene = bpy.context.scene
source_hash=hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()


def enable_gpu():
    addon = bpy.context.preferences.addons.get('cycles')
    if addon:
        prefs = addon.preferences
        for mode in ('OPTIX','CUDA'):
            try:
                prefs.compute_device_type = mode
                prefs.get_devices()
                if any(d.type != 'CPU' for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type != 'CPU'
                    scene.cycles.device = 'GPU'
                    print('RENDER_DEVICE', mode, flush=True)
                    return
            except Exception as error:
                print('Device unavailable:', mode, error, flush=True)
    scene.cycles.device = 'CPU'


enable_gpu()
out = ROOT / ('previews' if preview else 'renders')
out.mkdir(parents=True, exist_ok=True)
scene.render.resolution_x = 1280 if preview else 3840
scene.render.resolution_y = 720 if preview else 2160
scene.render.resolution_percentage = 100
scene.cycles.samples = samples
scene.cycles.adaptive_threshold = threshold
scene.cycles.use_denoising = True
scene.render.use_persistent_data = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.image_settings.color_depth = '8' if preview else '16'
cameras = sorted([o for o in bpy.data.objects if o.type == 'CAMERA' and o.get('render_id')], key=lambda o:o.name)
if requested:
    cameras = [c for c in cameras if c.name == requested]
    if not cameras:
        raise ValueError('Unknown requested camera '+requested)
report_path = out / 'render_report.json'
report = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else []
browser_names = {
    '01_sala_a_principal': '01-sala-a.png',
    '02_sala_a_contravista': '02-sala-a.png',
    '03_pasillo': '03-pasillo.png',
    '04_sala_b_principal': '04-sala-b.png',
    '05_sala_b_contravista': '05-sala-b.png',
    '06_detalle_obra': '06-detalle.png',
}
for camera in cameras:
    matching=any(item.get('camera')==camera.name and item.get('sourceSHA256')==source_hash
                 and item.get('samples_max',0)>=samples and item.get('adaptive_threshold',1)<=threshold+1e-6
                 and item.get('width')==scene.render.resolution_x and item.get('height')==scene.render.resolution_y for item in report)
    if resume and matching and (out/(camera.name+'.png')).exists() and (preview or (out/(camera.name+'.exr')).exists()):
        print('RENDER_SKIP_COMPLETE',camera.name,flush=True)
        continue
    scene.camera = camera
    scene.render.filepath = str(out / (camera.name+'.png'))
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '8' if preview else '16'
    start=time.time()
    print('RENDER_START', camera.name, flush=True)
    bpy.ops.render.render(write_still=True)
    duration=time.time()-start
    if not preview:
        scene.render.image_settings.file_format = 'OPEN_EXR'
        scene.render.image_settings.color_depth = '16'
        scene.render.image_settings.exr_codec = 'ZIP'
        bpy.data.images['Render Result'].save_render(str(out / (camera.name+'.exr')), scene=scene)
        # Load the display-transformed PNG; save(), not save_render(), avoids
        # applying AgX again to a browser derivative. Keep EXR linear/unscaled.
        public = ROOT / 'web' / 'public' / 'renders'
        public.mkdir(parents=True, exist_ok=True)
        display_image = bpy.data.images.load(str(out / (camera.name+'.png')), check_existing=False)
        display_image.scale(1920,1080)
        display_image.file_format = 'PNG'
        display_image.filepath_raw = str(public / browser_names[camera.name])
        display_image.save()
        bpy.data.images.remove(display_image)
    item={'camera':camera.name,'width':scene.render.resolution_x,'height':scene.render.resolution_y,
          'duration_seconds':round(duration,2),'samples_max':scene.cycles.samples,
          'adaptive_threshold':scene.cycles.adaptive_threshold,'preview':preview,'sourceSHA256':source_hash}
    report = [previous for previous in report if previous['camera'] != camera.name]
    report.append(item)
    report.sort(key=lambda entry:entry['camera'])
    report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('RENDER_DONE', json.dumps(item), flush=True)
print('BATCH_DONE', len(report), flush=True)
