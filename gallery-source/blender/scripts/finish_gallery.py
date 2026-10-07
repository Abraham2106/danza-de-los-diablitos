"""Reproducible architectural finishing pass. Run after build_gallery.py.

Designed for Blender 5.2. No export work is done here. Procedural micro-detail
is deliberately paired with simple Principled base values for glTF fallback.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
SCENE = bpy.context.scene


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        SCENE.collection.children.link(col)
    return col


def clear_collection(name):
    col = collection(name)
    for obj in list(col.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    return col


def material_finish(name, color, roughness, metallic=0.0, micro=None):
    mat = bpy.data.materials.get(name)
    if mat is None:
        return
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    principled = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if principled is None:
        return
    principled.inputs['Base Color'].default_value = (*color, 1)
    principled.inputs['Roughness'].default_value = roughness
    principled.inputs['Metallic'].default_value = metallic
    mat.diffuse_color = (*color, 1)
    if micro:
        for node in list(nodes):
            if node.label.startswith('GalleryFinish'):
                nodes.remove(node)
        tex = nodes.new('ShaderNodeTexNoise')
        tex.label = 'GalleryFinish: micro surface'
        tex.inputs['Scale'].default_value = micro[0]
        tex.inputs['Detail'].default_value = 2
        coords = nodes.new('ShaderNodeTexCoord')
        coords.label = 'GalleryFinish: coordinates'
        links.new(coords.outputs['Object'], tex.inputs['Vector'])
        bump = nodes.new('ShaderNodeBump')
        bump.label = 'GalleryFinish: subtle bump'
        bump.inputs['Strength'].default_value = micro[1]
        bump.inputs['Distance'].default_value = micro[2]
        links.new(tex.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], principled.inputs['Normal'])
    mat['web_roughness'] = roughness
    mat['web_color'] = list(color)
    mat['web_metallic'] = metallic


def light(col, name, kind, position, target, energy, color, size=1.0):
    data = bpy.data.lights.new(name, kind)
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    obj.location = position
    aim(obj, target)
    data.energy = energy
    data.color = color
    if kind == 'AREA':
        data.shape = 'RECTANGLE'
        data.size = size
        data.size_y = 3.1
    return obj


def gpu_setup():
    addon = bpy.context.preferences.addons.get('cycles')
    if addon:
        prefs = addon.preferences
        for mode in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
            try:
                prefs.compute_device_type = mode
                prefs.get_devices()
                available = [d for d in prefs.devices if d.type != 'CPU']
                if available:
                    for device in prefs.devices:
                        device.use = device.type != 'CPU'
                    SCENE.cycles.device = 'GPU'
                    print('Cycles device:', mode, [d.name for d in available])
                    return
            except Exception:
                pass
    SCENE.cycles.device = 'CPU'
    print('Cycles device: CPU')


def organic_tree_finish():
    """Keep the quiet sculpture garden, replacing stacked sphere silhouettes."""
    import random
    rng = random.Random(90121)
    gallery = bpy.data.collections.get('Gallery')
    for obj in list(bpy.data.objects):
        if obj.name.startswith('Exterior_TreeBranch_'):
            bpy.data.objects.remove(obj, do_unlink=True)
    canopies = sorted([o for o in bpy.data.objects if o.name.startswith('Exterior_Canopy_')], key=lambda o:o.name)
    for obj in canopies:
        if not obj.get('gallery_organic_finish'):
            obj['organic_original_location'] = list(obj.location)
            obj['organic_original_scale'] = list(obj.scale)
            for vertex in obj.data.vertices:
                p = vertex.co
                factor = 1 + .15*math.sin(p.x*7.9+p.y*3.7)*math.cos(p.z*6.3+p.x*2.2)
                p *= factor
            obj['gallery_organic_finish'] = True
        base = Vector(obj['organic_original_location'])
        original_scale = Vector(obj['organic_original_scale'])
        cluster = int(obj.name.rsplit('_',1)[1])
        offsets = [(-.25,.12,.0),(-.62,-.25,-.23),(.57,.27,-.12)]
        obj.location = base+Vector(offsets[cluster])
        obj.scale = original_scale*([1.12,.88,.93][cluster])
        obj.scale.z *= [1.04,.88,.92][cluster]
        tree_number = obj.name.split('_')[2]
        trunk = bpy.data.objects.get('Exterior_Trunk_'+tree_number)
        if trunk and gallery:
            start = trunk.location + Vector((0,0,trunk.dimensions.z*.43))
            end = obj.location + Vector((0,0,-obj.scale.z*.35))
            delta = end-start
            bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.042, depth=delta.length, location=(start+end)/2)
            branch = bpy.context.object
            branch.name = 'Exterior_TreeBranch_'+tree_number+'_'+str(cluster)
            branch.rotation_euler = delta.to_track_quat('Z','Y').to_euler()
            for col in list(branch.users_collection):
                col.objects.unlink(branch)
            gallery.objects.link(branch)
            branch.data.materials.append(bpy.data.materials['MAT_Wood'])
            for poly in branch.data.polygons:
                poly.use_smooth = True
    leaf = bpy.data.materials.get('MAT_Leaves')
    if leaf:
        material_finish('MAT_Leaves',(.10,.19,.073),.88)


def align_luminaires():
    """Fix the original corridor ±1.6 m vs hall ±2 m offset.

    Two inner lines are continuous across both room thresholds; outer lines
    share the hall column grid. Identical fixture cross-sections everywhere.
    """
    gallery = bpy.data.collections['Gallery']
    for obj in list(bpy.data.objects):
        if obj.name.startswith(('LuminaireHousing_', 'LuminaireDiffuser_')):
            bpy.data.objects.remove(obj,do_unlink=True)
    def fixture_box(name, position, dimensions, material):
        bpy.ops.mesh.primitive_cube_add(size=1,location=position)
        obj = bpy.context.object
        obj.name = name
        obj.scale = dimensions
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        for col in list(obj.users_collection):
            col.objects.unlink(obj)
        gallery.objects.link(obj)
        obj.data.materials.append(material)
        bevel = obj.modifiers.new('Recessed edge finishing','BEVEL')
        bevel.width = .004
        bevel.segments = 2
        obj['galleryRole'] = 'luminaire'
        return obj
    lines = [('InnerNorth', -21.7,21.7,2),('InnerSouth', -21.7,21.7,-2)]
    for hall, x1,x2 in [('A',-21.7,-6.3),('B',6.3,21.7)]:
        lines += [(hall+'North',x1,x2,6),(hall+'South',x1,x2,-6)]
    for name,x1,x2,y in lines:
        length = x2-x1
        housing = fixture_box('LuminaireHousing_'+name,((x1+x2)/2,y,4.78),(length,.20,.06),bpy.data.materials['MAT_Metal'])
        diffuser = fixture_box('LuminaireDiffuser_'+name,((x1+x2)/2,y,4.744),(length-.02,.085,.012),bpy.data.materials['MAT_LED'])
        housing['grid_axis_y'] = y
        diffuser['grid_axis_y'] = y
    SCENE['gallery_luminaire_grid'] = 'Continuous X strips: inner Y±2 across both halls and corridor; outer Y±6; every diffuser Z4.744 and housing Z4.78.'


def licensed_tree_finish():
    """Append CC0 Quaternius mesh assets; keep data linked between instances."""
    import json, random
    asset_dir = ROOT / 'assets' / 'trees'
    sources = [asset_dir / name for name in ('NormalTree_1.blend','NormalTree_3.blend','BirchTree_1.blend')]
    sources = [path for path in sources if path.exists()]
    if not sources:
        return False
    gallery = bpy.data.collections['Gallery']
    cached = {}
    for obj in bpy.data.objects:
        if obj.name.startswith('Exterior_TreeAsset_') and obj.type == 'MESH' and obj.get('assetSource'):
            height = max(v.co.z for v in obj.data.vertices)-min(v.co.z for v in obj.data.vertices)
            cached[obj['assetSource']] = (obj.data,height,obj['assetSource'])
    if not SCENE.get('gallery_tree_placements'):
        old = sorted([o for o in bpy.data.objects if o.name.startswith('Exterior_Trunk_')],key=lambda o:o.name)
        placements = [{'x':o.location.x,'y':o.location.y,'height':max(5.5,o.dimensions.z/.66*1.15)} for o in old]
        SCENE['gallery_tree_placements'] = json.dumps(placements)
    else:
        placements = json.loads(SCENE['gallery_tree_placements'])
    for obj in list(bpy.data.objects):
        if obj.name.startswith(('Exterior_Canopy_','Exterior_Trunk_','Exterior_TreeBranch_','Exterior_TreeAsset_')):
            bpy.data.objects.remove(obj,do_unlink=True)
    available_textures = {path.name: path for path in asset_dir.rglob('*.png')}
    texture_aliases = {'NormalTree_Normal.png':'NormalTree_Bark_Normal.png',
                       'BirchBark_normal.png':'BirchTree_Bark_Normal.png'}
    prototypes=[]
    for source in sources:
        if source.name in cached:
            prototypes.append(cached[source.name])
            continue
        with bpy.data.libraries.load(str(source),link=False) as (available, appended):
            appended.objects = available.objects
        for obj in appended.objects:
            if obj is None or obj.type != 'MESH':
                continue
            gallery.objects.link(obj)
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            for modifier in list(obj.modifiers):
                if modifier.show_render:
                    bpy.ops.object.modifier_apply(modifier=modifier.name)
            obj.data.transform(obj.matrix_world)
            obj.matrix_world = Matrix.Identity(4)
            vertices = [v.co for v in obj.data.vertices]
            low = Vector(tuple(min(v[i] for v in vertices) for i in range(3)))
            high = Vector(tuple(max(v[i] for v in vertices) for i in range(3)))
            center = (low+high)/2
            obj.data.transform(Matrix.Translation((-center.x,-center.y,-low.z)))
            height = high.z-low.z
            for mat in obj.data.materials:
                if mat and mat.use_nodes:
                    for node in mat.node_tree.nodes:
                        if node.type == 'TEX_IMAGE' and node.image:
                            image = node.image
                            basename = Path(image.filepath).name or image.name
                            basename = texture_aliases.get(basename,basename)
                            if basename in available_textures:
                                image.filepath = str(available_textures[basename])
                                image.reload()
                                if not image.packed_file:
                                    image.pack()
            prototypes.append((obj.data,height,source.name))
            bpy.data.objects.remove(obj,do_unlink=True)
    if not prototypes:
        raise RuntimeError('Licensed tree files contained no mesh objects')
    rng = random.Random(741)
    for index, placement in enumerate(placements):
        mesh,height,source_name = prototypes[index%len(prototypes)]
        obj = bpy.data.objects.new('Exterior_TreeAsset_%02d'%index,mesh)
        gallery.objects.link(obj)
        obj.location = (placement['x'],placement['y'],-.11)
        size = placement['height']/height
        obj.scale = (size,size,size)
        obj.rotation_euler.z = rng.uniform(0,math.tau)
        obj['galleryRole'] = 'vegetation'
        obj['assetSource'] = source_name
        obj['assetLicense'] = 'CC0 1.0 / Quaternius Ultimate Stylized Nature Pack'
    SCENE['gallery_tree_asset_version'] = 1
    SCENE['gallery_tree_license'] = 'Quaternius Ultimate Stylized Nature Pack, CC0: https://quaternius.com/packs/ultimatestylizednature.html'
    for image in bpy.data.images:
        if image.source == 'FILE':
            basename = Path(image.filepath).name
            mapped = texture_aliases.get(basename,basename)
            if basename in texture_aliases and mapped in available_textures:
                image.filepath = str(available_textures[mapped])
                image.reload()
                image.colorspace_settings.name = 'Non-Color'
                if not image.packed_file:
                    image.pack()
    print('Licensed tree instances:',len(placements),'source meshes:',len(prototypes),
          'polygons:',sum(len(mesh.polygons) for mesh,_,_ in prototypes))
    return True


def main():
    material_finish('MAT_Wall', (0.78, 0.765, 0.735), 0.76, micro=(140, .11, .003))
    material_finish('MAT_Ceiling', (0.82, .81, .78), .82, micro=(160, .07, .002))
    material_finish('MAT_Panel', (.72, .71, .68), .75, micro=(130, .09, .002))
    material_finish('MAT_Floor', (.35, .37, .36), .28, micro=(100, .045, .0015))
    material_finish('MAT_Concrete', (.47, .48, .46), .7, micro=(35, .16, .006))
    material_finish('MAT_Metal', (.027, .032, .033), .28, metallic=.82)
    material_finish('MAT_Wood', (.21, .092, .029), .38, micro=(65, .10, .004))
    if not licensed_tree_finish():
        organic_tree_finish()
    align_luminaires()
    glass = bpy.data.materials.get('MAT_Glass')
    if glass:
        principled = next((n for n in glass.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if principled:
            principled.inputs['Base Color'].default_value = (.96, .985, 1, 1)
            principled.inputs['Roughness'].default_value = .045
            principled.inputs['IOR'].default_value = 1.45
            principled.inputs['Transmission Weight'].default_value = 1
    lighting = clear_collection('Lighting')
    world = bpy.data.worlds.get('Gallery_Daylight') or bpy.data.worlds.new('Gallery_Daylight')
    SCENE.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    sky = nodes.new('ShaderNodeTexSky')
    sky_types = [item.identifier for item in sky.bl_rna.properties['sky_type'].enum_items]
    sky.sky_type = next(kind for kind in ('MULTIPLE_SCATTERING', 'NISHITA', 'SINGLE_SCATTERING', 'HOSEK_WILKIE') if kind in sky_types)
    sky.sun_elevation = math.radians(34)
    sky.sun_rotation = math.radians(72)
    sky.sun_disc = True
    sky.sun_size = math.radians(2)
    sky.air_density = 1.1
    if hasattr(sky, 'aerosol_density'):
        sky.aerosol_density = 1.8
    elif hasattr(sky, 'dust_density'):
        sky.dust_density = 1.8
    background = nodes.new('ShaderNodeBackground')
    background.inputs['Strength'].default_value = .42
    output = nodes.new('ShaderNodeOutputWorld')
    links.new(sky.outputs['Color'], background.inputs['Color'])
    links.new(background.outputs['Background'], output.inputs['Surface'])
    sun = light(lighting, 'Sun_Daylight', 'SUN', (0, 14, 12), (-5, 0, 0), 1.2, (1, .90, .76))
    sun.data.angle = math.radians(3)
    # Window strips supply a broad, naturally soft daylight wash.
    for hall_x in (-14, 14):
        for offset in (-4.8, 0, 4.8):
            light(lighting, f'Daylight_{hall_x}_{offset}', 'AREA', (hall_x+offset, 8.72, 2.65),
                  (hall_x+offset, 1, 1.4), 620, (.84, .91, 1), 4.6)
        light(lighting, f'CeilingBounce_{hall_x}', 'AREA', (hall_x, 0, 4.64), (hall_x, 0, 0),
              430, (1, .91, .80), 11)
    light(lighting, 'Daylight_Corridor', 'AREA', (0, 3.3, 2.65), (0, -2, 1.2), 370, (.84,.91,1), 10)
    light(lighting, 'CeilingBounce_Corridor', 'AREA', (0, 0, 4.65), (0, 0, 0), 160, (1,.91,.81), 8)
    # Art roots carry front -Y locally, matching the source wall rotations.
    roots = [o for o in bpy.data.objects if o.name.startswith('Artwork_art-')]
    for index, art in enumerate(sorted(roots, key=lambda o:o.name)):
        center = art.matrix_world.translation.copy()
        normal = art.matrix_world.to_3x3() @ Vector((0,-1,0))
        source = center + normal*1.05 + Vector((0,0,2.45))
        spot = light(lighting, f'ArtSpot_{index+1:03}', 'SPOT', source, center, 65, (1,.91,.78))
        spot.data.spot_size = math.radians(70)
        spot.data.spot_blend = .85
        spot.data.shadow_soft_size = .18
    cameras = clear_collection('Cameras')
    specs = [
        ('01_sala_a_principal', (-20.9, -4.5, 1.7), (-12.1, 2.0, 1.75), 22),
        ('02_sala_a_contravista', (-7.4, 4.6, 1.7), (-16.8, -4.0, 1.75), 22),
        ('03_pasillo', (-5.3, .8, 1.68), (8.8, 0, 1.73), 25),
        ('04_sala_b_principal', (7.4, 4.5, 1.72), (17.8, -3.8, 1.75), 22),
        ('05_sala_b_contravista', (20.8, -4.5, 1.7), (12.0, 2.7, 1.75), 22),
        ('06_detalle_obra', (-20.5, -4.6, 1.67), (-17.65, -8.84, 1.72), 35),
    ]
    for name, position, target, focal in specs:
        data = bpy.data.cameras.new(name)
        obj = bpy.data.objects.new(name, data)
        cameras.objects.link(obj)
        obj.location = position
        aim(obj, target)
        data.lens = focal
        data.sensor_width = 36
        data.clip_start = .05
        data.clip_end = 500
        obj['render_id'] = name
    SCENE.camera = bpy.data.objects[specs[0][0]]
    SCENE.render.engine = 'CYCLES'
    gpu_setup()
    SCENE.cycles.samples = 512
    SCENE.cycles.use_adaptive_sampling = True
    SCENE.cycles.adaptive_threshold = .01
    SCENE.cycles.use_denoising = True
    SCENE.cycles.max_bounces = 8
    SCENE.cycles.diffuse_bounces = 4
    SCENE.cycles.glossy_bounces = 4
    SCENE.cycles.transmission_bounces = 6
    SCENE.cycles.transparent_max_bounces = 8
    SCENE.render.resolution_x = 3840
    SCENE.render.resolution_y = 2160
    SCENE.render.resolution_percentage = 100
    SCENE.render.image_settings.file_format = 'PNG'
    SCENE.render.image_settings.color_mode = 'RGB'
    SCENE.render.image_settings.color_depth = '16'
    SCENE.view_settings.view_transform = 'AgX'
    SCENE.view_settings.exposure = .45
    SCENE.view_settings.gamma = 1
    SCENE.render.film_transparent = False
    SCENE['gallery_finish_version'] = 1
    SCENE['render_notes'] = 'Cycles 4K adaptive 0.01, denoised. Procedural micro normals require baking for matching glTF appearance; Principled color/roughness remains exportable.'
    target = ROOT / 'blender' / 'gallery.blend'
    target.parent.mkdir(parents=True, exist_ok=True)
    # Metadata/cartela refresh also makes reruns reflect corrected content.
    import json, textwrap
    data_path = ROOT / 'data' / 'exhibition.json'
    if data_path.exists():
        for art in json.loads(data_path.read_text(encoding='utf-8'))['artworks']:
            art_root = bpy.data.objects.get('Artwork_'+art['id'])
            if art_root:
                art_root['title'] = art['title']
            label = bpy.data.objects.get('LabelText_'+art['id'])
            if label:
                label.data.body = '\n'.join(textwrap.wrap(art['title'],27))+'\n'+art['artist']+'\n'+str(art['year'])
    for image in bpy.data.images:
        if image.source == 'FILE' and image.has_data and not image.packed_file:
            image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(target))
    print('Finished gallery saved:', target, 'Art lights:', len(roots), 'Cameras:', len(specs))


if __name__ == '__main__':
    main()
