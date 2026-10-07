"""Export a saved gallery to GLB and JSON without changing or saving its source .blend.

blender -b gallery.blend -P export_gallery.py -- --no-bake
blender -b gallery.blend -P export_gallery.py -- --atlas-size 4096 --samples 32 --device CPU
"""
import bpy
import json
import math
import sys
import argparse
import time
import shutil
import hashlib
import re
import struct
import tempfile
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'web'/'public'
REPORT=ROOT/'blender'/'export-report.json'
RAW_ATLASES=ROOT/'blender'/'baked-textures'
sys.path.insert(0,str(Path(__file__).resolve().parent))
from denoise_lighting import denoise_image

def three(p): return [round(float(p.x),6),round(float(p.z),6),round(float(-p.y),6)]
def navigation_matrix(ob):
    # Hidden navigation collections are excluded from dependency updates. Recompose
    # their transforms so moved artwork/panel parents never leave frozen waypoints.
    if ob.parent:return ob.parent.matrix_world@ob.matrix_parent_inverse@ob.matrix_basis
    return ob.matrix_basis
def angle(ob):
    axis=ob.matrix_world.to_3x3()@Vector((1,0,0))
    return math.atan2(float(axis.y),float(axis.x))
def bounds(ob):
    pts=[ob.matrix_world@Vector(p) for p in ob.bound_box]
    return {'minX':min(float(p.x) for p in pts),'maxX':max(float(p.x) for p in pts),
            'minZ':min(float(-p.y) for p in pts),'maxZ':max(float(-p.y) for p in pts)}
def obb(ob,margin=0):
    local=[Vector(p) for p in ob.bound_box]
    lo=Vector([min(p[i] for p in local) for i in range(3)])
    hi=Vector([max(p[i] for p in local) for i in range(3)])
    center=ob.matrix_world@((lo+hi)/2)
    matrix=ob.matrix_world.to_3x3()
    return {'x':float(center.x),'z':float(-center.y),'width':float((hi.x-lo.x)*(matrix@Vector((1,0,0))).length)+margin,
            'depth':float((hi.y-lo.y)*(matrix@Vector((0,1,0))).length)+margin,'rotation':-angle(ob)}

def point_safe(p,nav,r=.33):
    x,z=p[0],p[2]
    if not any(a['x1']<=x<=a['x2'] and a['z1']<=z<=a['z2'] for a in nav['walkable']): return False
    for b in nav['boxes']:
        dx=x-max(b['minX'],min(x,b['maxX'])); dz=z-max(b['minZ'],min(z,b['maxZ']))
        if dx*dx+dz*dz<r*r:return False
    for b in nav['orientedBoxes']:
        co,si=math.cos(b['rotation']),math.sin(b['rotation']); dx=x-b['x']; dz=z-b['z']
        lx=co*dx+si*dz; lz=-si*dx+co*dz
        ddx=lx-max(-b['width']/2,min(lx,b['width']/2)); ddz=lz-max(-b['depth']/2,min(lz,b['depth']/2))
        if ddx*ddx+ddz*ddz<r*r:return False
    return not any((x-c['x'])**2+(z-c['z'])**2<(r+c['r'])**2 for c in nav['circles'])

def scene_data(scene):
    previous=json.loads((ROOT/'data'/'exhibition.json').read_text(encoding='utf-8-sig'))
    old={a['id']:a for a in previous['artworks']}
    gallery=bpy.data.collections.get('Gallery')
    if not gallery:raise ValueError('Missing Gallery collection')
    obs=list(gallery.all_objects)
    nav={'boxes':[],'orientedBoxes':[],'circles':[],'walkable':[]}
    for ob in obs:
        if ob.name.startswith('Wall_'):nav['boxes'].append(bounds(ob))
        elif ob.get('decorCollider'):
            nav['orientedBoxes'].append(obb(ob,float(ob.get('decorMargin',.05))))
        elif ob.name.startswith('WindowRail_') and ob.matrix_world.translation.z<.2:
            nav['boxes'].append(bounds(ob))
        elif ob.name.startswith('PanelBody_'):nav['orientedBoxes'].append(obb(ob,.05))
        elif ob.name.startswith('BenchSeat_'):nav['orientedBoxes'].append(obb(ob,.05))
        elif ob.name.startswith('Column_'):
            b=bounds(ob); p=ob.matrix_world.translation
            nav['circles'].append({'x':float(p.x),'z':float(-p.y),'r':max(b['maxX']-b['minX'],b['maxZ']-b['minZ'])/2})
        elif ob.name.startswith(('Floor_Room_','Floor_Corridor')):
            b=bounds(ob);nav['walkable'].append({'x1':b['minX'],'x2':b['maxX'],'z1':b['minZ'],'z2':b['maxZ']})
    start=bpy.data.objects.get('VisitorStart')
    nav['spawn']={'position':three(navigation_matrix(start).translation) if start else [-8.5,1.65,0],
                  'yaw':float(start.get('yaw',math.pi/2)) if start else math.pi/2}
    warnings=[]; arts=[]; ids=set()
    roots=[ob for ob in obs if ob.get('artworkId') and ob.name.startswith('Artwork_')]
    for ob in sorted(roots,key=lambda o:o['artworkId']):
        aid=str(ob['artworkId'])
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}',aid):raise ValueError('Invalid artwork identifier: '+aid)
        if aid in ids:raise ValueError('Duplicate artworkId: '+aid)
        ids.add(aid); a=dict(old.get(aid,{})); a['id']=aid
        for key in ('title','artist','year','description','image'):
            value=ob.get(key,a.get(key,''))
            a[key]=str(value if value else a.get(key,''))
        source=str(ob.get('source',a.get('source','')))
        if source.startswith(('https://','http://')):a['imageUrl']=source
        elif source:a['source']=source
        a.setdefault('source','Colección de la exposición')
        a.setdefault('frame','black')
        for field in ('title','artist','description','source'):
            if not str(a.get(field,'')).strip():raise ValueError('Missing '+field+' metadata for '+aid)
        a['position']=three(ob.matrix_world.translation); a['rotation']=angle(ob)
        painting=bpy.data.objects.get('Painting_'+aid)
        if not painting:raise ValueError('Painting mesh missing for '+aid)
        image_node=None
        for mat in painting.data.materials:
            if not mat or not mat.use_nodes:continue
            shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            links=shader.inputs['Base Color'].links if shader else []
            node=next((link.from_node for link in links if link.from_node.type=='TEX_IMAGE' and link.from_node.image),None)
            if node:image_node=node;break
        if not image_node:raise ValueError('Painting '+aid+' requires a connected image texture')
        a['image']='artworks/'+aid+'.jpg'
        local=[Vector(p) for p in painting.bound_box]; transform=painting.matrix_world.to_3x3()
        a['width']=(max(p.x for p in local)-min(p.x for p in local))*(transform@Vector((1,0,0))).length
        a['height']=(max(p.z for p in local)-min(p.z for p in local))*(transform@Vector((0,0,1))).length
        image=PUBLIC/a['image']
        if not image_node.image.has_data:
            try:_=image_node.image.pixels[0]
            except Exception as e:raise ValueError('Image data unavailable for '+aid) from e
        if not image_node.image.has_data:raise ValueError('Image data unavailable for '+aid)
        observation=bpy.data.objects.get('Observation_'+aid)
        if observation: position=three(navigation_matrix(observation).translation)
        else:
            p=ob.matrix_world.translation+(ob.matrix_world.to_3x3()@Vector((0,-2.2,0)))
            p.z=1.65;position=three(p)
        if not point_safe(position,nav):
            warnings.append('Observation '+aid+' obstructed; viewer will retain its position')
        dx=a['position'][0]-position[0];dz=a['position'][2]-position[2]
        a['observation']={'position':position,'yaw':math.atan2(-dx,-dz)}
        arts.append(a)
    if not arts:raise ValueError('No artworks in Gallery')
    if not point_safe(nav['spawn']['position'],nav):raise ValueError('VisitorStart is outside navigable space or obstructed')
    previous.update({'schemaVersion':1,'title':str(scene.get('gallery_title',previous.get('title','Luz y color'))),
                     'model':'models/gallery.glb','artworks':arts,'navigation':nav})
    return previous,warnings

def export_artwork_images(data):
    for art in data['artworks']:
        painting=bpy.data.objects['Painting_'+art['id']]
        current=None
        for mat in painting.data.materials:
            if not mat or not mat.use_nodes:continue
            shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if shader:
                current=next((l.from_node.image for l in shader.inputs['Base Color'].links if l.from_node.type=='TEX_IMAGE' and l.from_node.image),None)
            if current:break
        if current is None:raise ValueError('No artwork image '+art['id'])
        target=PUBLIC/art['image'];target.parent.mkdir(parents=True,exist_ok=True)
        original=Path(bpy.path.abspath(current.filepath)) if current.filepath else None
        if original and original.is_file() and original.resolve()==target.resolve() and not current.is_dirty:continue
        if original and original.is_file() and original.suffix.lower() in ('.jpg','.jpeg') and not current.is_dirty:
            shutil.copy2(original,target)
        else:
            copy=current.copy()
            try:
                copy.filepath_raw=str(target);copy.file_format='JPEG';copy.save()
            finally:bpy.data.images.remove(copy)

def temp_scene(source):
    tmp=bpy.data.scenes.new('__GalleryExport_Temporary')
    tmp.world=source.world.copy() if source.world else None
    tmp.render.engine='CYCLES';tmp.cycles.samples=32
    tmp.cycles.max_bounces=8;tmp.cycles.diffuse_bounces=4;tmp.cycles.transmission_bounces=6
    tmp.view_settings.view_transform=source.view_settings.view_transform
    tmp.view_settings.exposure=source.view_settings.exposure
    gallery=bpy.data.collections['Gallery']
    source_objects=list(dict.fromkeys(list(gallery.all_objects)+[o for o in source.objects if o.type=='LIGHT' and not o.hide_render and any(not c.hide_render for c in o.users_collection)]))
    depsgraph=bpy.context.evaluated_depsgraph_get();copies={};materials={};mesh_cache={}
    for ob in source_objects:
        if ob.type not in ('MESH','FONT','EMPTY','LIGHT'):continue
        if ob.type in ('MESH','FONT'):
            key=(ob.data.as_pointer(),tuple(s.material.name if s.material else '' for s in ob.material_slots)) if ob.type=='MESH' and not ob.modifiers else None
            mesh=mesh_cache.get(key) if key else None
            reused=mesh is not None
            if mesh is None:
                mesh=bpy.data.meshes.new_from_object(ob.evaluated_get(depsgraph),preserve_all_data_layers=True,depsgraph=depsgraph)
                if key:mesh_cache[key]=mesh
            copy=bpy.data.objects.new(ob.name+'_WEB',mesh)
            if not reused:
                for i,mat in enumerate(mesh.materials):
                    if mat:
                        if mat.name not in materials:materials[mat.name]=mat.copy()
                        mesh.materials[i]=materials[mat.name]
        else:
            copy=bpy.data.objects.new(ob.name+'_WEB',ob.data.copy() if ob.data else None)
        tmp.collection.objects.link(copy);copy.matrix_world=ob.matrix_world.copy()
        for k in ob.keys():
            if k!='_RNA_UI':copy[k]=ob[k]
        copy['exportSource']=ob.name;copies[ob]=copy
    for old,new in copies.items():
        if old.parent in copies:
            world=new.matrix_world.copy();new.parent=copies[old.parent];new.matrix_world=world
    bpy.context.window.scene=tmp
    bpy.context.view_layer.update()
    return tmp,copies

def configure_device(scene,device):
    scene.cycles.device='CPU'
    scene.render.threads_mode='FIXED';scene.render.threads=8
    if device=='GPU':
        prefs=bpy.context.preferences.addons['cycles'].preferences
        for backend in ('OPTIX','CUDA','HIP','ONEAPI','METAL'):
            try:
                prefs.compute_device_type=backend;prefs.get_devices()
                if any(d.type!='CPU' for d in prefs.devices):
                    for d in prefs.devices:d.use=d.type!='CPU'
                    scene.cycles.device='GPU';return
            except Exception:pass
        print('GPU unavailable; using CPU')

def bake_architecture(scene,copies,args):
    groups={'room-a':[],'corridor':[],'room-b':[]}
    for source,copy in copies.items():
        if copy.type=='MESH' and source.get('webBake') and not source.name.startswith('Exterior_'):
            x=source.matrix_world.translation.x
            group='room-a' if x<-6 else 'room-b' if x>6 else 'corridor'
            groups[group].append(copy)
    scene.cycles.samples=args.samples;configure_device(scene,args.device)
    scene.render.bake.use_pass_color=True;scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True
    scene.render.bake.margin=16
    scene.render.bake.use_clear=True
    atlases=[];finished=[]
    for group,objects in groups.items():
        if not objects:continue
        print('BAKE_BEGIN',group,len(objects),flush=True)
        bpy.ops.object.select_all(action='DESELECT')
        detail_materials={}
        for ob in objects:
            # Millimetre joints, skirting, and thin panel rims have UV islands
            # smaller than a texel. Keep their smooth original PBR colors
            # rather than sampling noisy/black atlas gutters at grazing angles.
            source_name=str(ob.get('exportSource',''))
            flag=6 if source_name.startswith('FloorJoint_') else 1 if source_name.startswith('Skirting_') else 2 if source_name.startswith('PanelBody_') else 3 if source_name.startswith(('Floor_Room_','Floor_Corridor')) else 4 if source_name.startswith('Wall_') else 5 if source_name.startswith('Ceiling_') else 0
            detail=ob.data.attributes.new('webSmoothDetail','INT','FACE')
            for i,polygon in enumerate(ob.data.polygons):
                detail.data[i].value=flag if flag in (1,3,6) or (flag==2 and polygon.area<2) or (flag==4 and polygon.area<3) or (flag==5 and polygon.area<6) else 0
            if flag and ob.data.materials:detail_materials[flag]=ob.data.materials[0]
            ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        joined=bpy.context.object;world=joined.matrix_world.copy();joined.parent=None;joined.matrix_world=world
        joined.name='Architecture_'+group
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.006)
        bpy.ops.object.mode_set(mode='OBJECT')
        atlas=RAW_ATLASES/('lighting-'+group+'.png')
        cache=atlas.with_suffix('.json')
        if args.reuse_bakes:
            if not cache.is_file():raise ValueError('Atlas cache metadata missing; bake again: '+str(cache))
            cached=json.loads(cache.read_text(encoding='utf-8'))
            if cached.get('sourceSHA256')!=args.source_hash:raise ValueError('Source changed since atlas bake; bake again: '+group)
            if not atlas.is_file():raise ValueError('Cached atlas missing: '+str(atlas))
            image=bpy.data.images.load(str(atlas),check_existing=False)
            if list(image.size)!=[args.atlas_size,args.atlas_size]:raise ValueError('Cached atlas resolution mismatch: '+str(atlas))
        else:
            image=bpy.data.images.new('Baked_'+group,width=args.atlas_size,height=args.atlas_size,alpha=False,float_buffer=False)
            image.colorspace_settings.name='sRGB'
            image.generated_color=(.45,.45,.45,1)
            for mat in joined.data.materials:
                if mat:
                    target=mat.node_tree.nodes.new('ShaderNodeTexImage');target.image=image
                    mat.node_tree.nodes.active=target
            bpy.ops.object.bake(type='DIFFUSE')
            image.filepath_raw=str(atlas);image.file_format='PNG';image.save()
            cache.write_text(json.dumps({'sourceSHA256':args.source_hash,'atlasSize':args.atlas_size,'samples':args.samples}),encoding='utf-8')
            # Generated images otherwise force glTF through OS temp encoding. Reload
            # the actual atlas file, making encoding portable and directly reusable.
            image=bpy.data.images.load(str(atlas),check_existing=False)
        finished.append((group,joined,image,detail_materials))
        atlases.append(str(image.filepath_raw))
        print('BAKE_DONE',group,flush=True)
    # Keep every group's original scattering materials until all lighting is baked.
    for group,joined,image,detail_materials in finished:
        clean_atlas=RAW_ATLASES/('lighting-'+group+'-denoised.png')
        raw_atlas=RAW_ATLASES/('lighting-'+group+'.png')
        clean_cache=clean_atlas.with_suffix('.json')
        clean_key={'sourceSHA256':args.source_hash,'rawSHA256':hashlib.sha256(raw_atlas.read_bytes()).hexdigest(),'denoiserVersion':1}
        if clean_atlas.is_file() and clean_cache.is_file() and json.loads(clean_cache.read_text(encoding='utf-8'))==clean_key:
            image=bpy.data.images.load(str(clean_atlas),check_existing=False)
            print('DENOISE_REUSE',group,flush=True)
        else:
            print('DENOISE_BEGIN',group,flush=True)
            image=denoise_image(image,clean_atlas)
            clean_cache.write_text(json.dumps(clean_key),encoding='utf-8')
            print('DENOISE_DONE',group,flush=True)
        # Compress only web diffuse atlases. AUTO export then preserves normal
        # maps and alpha foliage as PNG rather than turning data maps into JPEG.
        web_atlas=Path(tempfile.tempdir)/('lighting-'+group+'.jpg')
        if not image.has_data:_=image.pixels[0]
        # Image.copy() does not copy loaded pixel buffers in Blender 5.2.
        # This export-only datablock can safely save to a new path directly.
        image.filepath_raw=str(web_atlas);image.file_format='JPEG';image.save(quality=92)
        image=bpy.data.images.load(str(web_atlas),check_existing=False)
        mat=bpy.data.materials.new('WEB_Baked_'+group);mat.use_nodes=True
        nodes=mat.node_tree.nodes;nodes.clear()
        output=nodes.new('ShaderNodeOutputMaterial')
        texture=nodes.new('ShaderNodeTexImage');texture.image=image
        # Blender glTF's shadeless detector recognizes a Color socket directly
        # connected to Surface, producing KHR_materials_unlit (an Emission node
        # alone exports as emissive PBR instead in Blender 5.2).
        mat.node_tree.links.new(texture.outputs['Color'],output.inputs['Surface'])
        joined.data.materials.clear();joined.data.materials.append(mat)
        detail_indices={}
        for flag,original in detail_materials.items():
            clean_material=original.copy();clean_material.name='WEB_SmoothDetail_'+group+'_'+str(flag)
            shader=next((n for n in clean_material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if shader:
                for name in ('Normal','Roughness','Metallic'):
                    for link in list(shader.inputs[name].links):clean_material.node_tree.links.remove(link)
                if flag==6:
                    shader.inputs['Base Color'].default_value=(.12,.13,.125,1)
                    shader.inputs['Roughness'].default_value=.9
                if flag==3:
                    # Keep the clean diffuse illumination and add the floor's
                    # PBR response so the browser preserves a soft specular
                    # sheen instead of flattening the entire floor to unlit.
                    clean_material.name='WEB_BakedFloor_'+group
                    shader.inputs['Base Color'].default_value=(.012,.012,.012,1)
                    shader.inputs['Roughness'].default_value=.28
                    shader.inputs['Metallic'].default_value=0
                    shader.inputs['Specular IOR Level'].default_value=.35
                    shader.inputs['Emission Strength'].default_value=1
                    floor_texture=clean_material.node_tree.nodes.new('ShaderNodeTexImage');floor_texture.image=image
                    clean_material.node_tree.links.new(floor_texture.outputs['Color'],shader.inputs['Emission Color'])
            detail_indices[flag]=len(joined.data.materials);joined.data.materials.append(clean_material)
        detail=joined.data.attributes.get('webSmoothDetail')
        for i,polygon in enumerate(joined.data.polygons):polygon.material_index=detail_indices.get(detail.data[i].value if detail else 0,0)
        if detail:joined.data.attributes.remove(detail)
        joined['webBake']=True;joined['bakedLighting']=True
    return atlases

def simplify_materials(scene):
    # glTF handles constants/textures, not Blender procedural noise; keep originals intact.
    visited=set()
    for ob in scene.objects:
        if ob.type!='MESH' or ob.get('bakedLighting'):continue
        for mat in ob.data.materials:
            if not mat or mat.name in visited:continue
            visited.add(mat.name)
            if not mat.use_nodes:continue
            shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if not shader and 'Tree_' in mat.name:
                # Imported botanical assets use Cycles Diffuse/Refraction node
                # graphs. Build an export-only Principled equivalent so glTF
                # keeps bark color, normals, and masked leaf silhouettes.
                textures=[n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
                color=next((i for i in textures if i.colorspace_settings.name=='sRGB'),None)
                normal=next((i for i in textures if i.colorspace_settings.name!='sRGB'),None)
                leaf='Leaves' in mat.name
                mat.node_tree.nodes.clear()
                output=mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
                shader=mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
                shader.inputs['Roughness'].default_value=.86
                shader.inputs['Specular IOR Level'].default_value=.2
                mat.node_tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
                if color:
                    texture=mat.node_tree.nodes.new('ShaderNodeTexImage');texture.image=color
                    mat.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
                    if leaf:
                        cutoff=mat.node_tree.nodes.new('ShaderNodeMath');cutoff.operation='GREATER_THAN';cutoff.inputs[1].default_value=.5
                        mat.node_tree.links.new(texture.outputs['Alpha'],cutoff.inputs[0])
                        mat.node_tree.links.new(cutoff.outputs[0],shader.inputs['Alpha'])
                if normal:
                    texture=mat.node_tree.nodes.new('ShaderNodeTexImage');texture.image=normal
                    normal_map=mat.node_tree.nodes.new('ShaderNodeNormalMap')
                    mat.node_tree.links.new(texture.outputs['Color'],normal_map.inputs['Color'])
                    mat.node_tree.links.new(normal_map.outputs['Normal'],shader.inputs['Normal'])
            if not shader:continue
            for name in ('Normal','Roughness','Metallic'):
                for link in list(shader.inputs[name].links):
                    if link.from_node.type not in ('TEX_IMAGE','NORMAL_MAP'):mat.node_tree.links.remove(link)

def prepare_visit_textures(scene,temporary,max_side=1536,quality=92):
    # GLB carries visit-resolution images; the catalog/lightbox retains full JPGs.
    resized=0
    for ob in scene.objects:
        if ob.type!='MESH' or not str(ob.get('exportSource','')).startswith('Painting_'):continue
        for mat in ob.data.materials:
            if not mat or not mat.use_nodes:continue
            shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if not shader:continue
            for link in shader.inputs['Base Color'].links:
                node=link.from_node
                if node.type!='TEX_IMAGE' or not node.image:continue
                source=node.image;w,h=source.size
                if max(w,h)<=max_side:continue
                copy=source.copy()
                try:
                    factor=max_side/max(w,h);copy.scale(max(1,round(w*factor)),max(1,round(h*factor)))
                    target=temporary/(str(ob['exportSource'])+'.jpg')
                    copy.filepath_raw=str(target);copy.file_format='JPEG';copy.save(quality=quality)
                    node.image=bpy.data.images.load(str(target),check_existing=False)
                    resized+=1
                finally:bpy.data.images.remove(copy,do_unlink=True)
    return resized

def prepare_pbr_textures(scene,temporary,max_side=1024,quality=92):
    """Derive small 8-bit export-only tree/fixture maps; preserve alpha/data maps."""
    prepared={};visited_materials=set()
    for ob in scene.objects:
        if ob.type!='MESH' or ob.get('bakedLighting') or str(ob.get('exportSource','')).startswith('Painting_'):continue
        for mat in ob.data.materials:
            if not mat or not mat.use_nodes:continue
            if mat.as_pointer() in visited_materials:continue
            visited_materials.add(mat.as_pointer())
            for node in mat.node_tree.nodes:
                if node.type!='TEX_IMAGE' or not node.image or not any(s.is_linked for s in node.outputs):continue
                source=node.image
                alpha=bool(node.outputs.get('Alpha') and node.outputs['Alpha'].is_linked)
                data=source.colorspace_settings.name!='sRGB'
                key=(source.as_pointer(),alpha,data)
                if key in prepared:node.image=prepared[key];continue
                if not source.has_data:_=source.pixels[0]
                w,h=source.size
                if not w or not h:raise ValueError('Texture unavailable: '+source.name)
                copy=source.copy();dest=None
                try:
                    limit=512 if data or alpha else max_side
                    ratio=min(1,limit/max(w,h));copy.scale(max(1,round(w*ratio)),max(1,round(h*ratio)))
                    w,h=copy.size;pixels=np.empty(w*h*4,dtype=np.float32);copy.pixels.foreach_get(pixels)
                    dest=bpy.data.images.new('WEB8_'+source.name,width=w,height=h,alpha=alpha,float_buffer=False,is_data=data)
                    dest.colorspace_settings.name=source.colorspace_settings.name
                    dest.pixels.foreach_set(pixels);dest.update()
                    filename=re.sub(r'[^A-Za-z0-9_-]','_',source.name)+('_alpha' if alpha else '')
                    path=temporary/(filename+('.png' if alpha or data else '.jpg'))
                    dest.filepath_raw=str(path);dest.file_format='PNG' if alpha or data else 'JPEG';dest.save(quality=quality)
                    loaded=bpy.data.images.load(str(path),check_existing=False)
                    loaded.colorspace_settings.name=source.colorspace_settings.name
                    prepared[key]=loaded;node.image=loaded
                finally:
                    bpy.data.images.remove(copy,do_unlink=True)
                    if dest:bpy.data.images.remove(dest,do_unlink=True)
    return len(prepared)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--no-bake',action='store_true')
    parser.add_argument('--metadata-only',action='store_true',help='Refresh images/JSON without replacing existing GLB')
    parser.add_argument('--reuse-bakes',action='store_true',help='Reuse atlases only when source geometry and lighting are unchanged')
    parser.add_argument('--atlas-size',type=int,default=4096,choices=(1024,2048,4096))
    parser.add_argument('--samples',type=int,default=32)
    parser.add_argument('--device',choices=('CPU','GPU'),default='CPU')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.no_bake and args.reuse_bakes:parser.error('--no-bake and --reuse-bakes are exclusive')
    start=time.time();source=bpy.context.scene
    temporary=(ROOT.parents[1]/'work'/'blender-temp').resolve()
    workspace_work=(ROOT.parents[1]/'work').resolve()
    if not temporary.is_relative_to(workspace_work):raise ValueError('Temporary directory outside workspace')
    temporary.mkdir(parents=True,exist_ok=True)
    tempfile.tempdir=str(temporary)
    source_file=Path(bpy.data.filepath)
    source_hash=hashlib.sha256(source_file.read_bytes()).hexdigest() if source_file.is_file() else None
    args.source_hash=source_hash
    (PUBLIC/'models').mkdir(parents=True,exist_ok=True);(PUBLIC/'data').mkdir(parents=True,exist_ok=True)
    (PUBLIC/'textures').mkdir(parents=True,exist_ok=True)
    RAW_ATLASES.mkdir(parents=True,exist_ok=True)
    exhibition,warnings=scene_data(source)
    export_artwork_images(exhibition)
    if args.metadata_only:
        text=json.dumps(exhibition,ensure_ascii=False,indent=2)
        (PUBLIC/'data'/'exhibition.json').write_text(text,encoding='utf-8')
        (ROOT/'data'/'exhibition.json').write_text(text,encoding='utf-8')
        if REPORT.is_file():
            report=json.loads(REPORT.read_text(encoding='utf-8'))
            report['metadataWarnings']=warnings
            report['sourceUnchanged']=source_hash==hashlib.sha256(source_file.read_bytes()).hexdigest() if source_hash else None
            glb=PUBLIC/'models'/'gallery.glb'
            if glb.is_file():
                raw=glb.read_bytes();json_size=struct.unpack_from('<I',raw,12)[0]
                gltf=json.loads(raw[20:20+json_size])
                report.setdefault('sourceVertices',report.get('vertices'))
                report.setdefault('sourceTriangles',report.get('triangles'))
                report['vertices']=sum(gltf['accessors'][p['attributes']['POSITION']]['count'] for mesh in gltf.get('meshes',[]) for p in mesh['primitives'])
                report['triangles']=sum(gltf['accessors'][p['indices']]['count']//3 for mesh in gltf.get('meshes',[]) for p in mesh['primitives'] if p.get('mode',4)==4 and 'indices' in p)
                report['bytes']=len(raw)
            REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print('METADATA_REPORT',json.dumps({'artworks':len(exhibition['artworks']),'spawn':exhibition['navigation']['spawn'],'warnings':warnings}),flush=True)
        return
    tmp,copies=temp_scene(source)
    atlases=[]
    try:
        if not args.no_bake:atlases=bake_architecture(tmp,copies,args)
        else:warnings.append('Preview export: architecture illumination not baked')
        simplify_materials(tmp)
        resized=prepare_visit_textures(tmp,temporary)
        pbr_maps=prepare_pbr_textures(tmp,temporary)
        bpy.ops.object.select_all(action='DESELECT')
        for ob in tmp.objects:
            if ob.type in ('MESH','EMPTY'):ob.select_set(True)
        bpy.context.view_layer.update()
        triangles=sum(sum(max(len(p.vertices)-2,0) for p in o.data.polygons) for o in tmp.objects if o.type=='MESH')
        vertices=sum(len(o.data.vertices) for o in tmp.objects if o.type=='MESH')
        target=PUBLIC/'models'/'gallery.glb'
        bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,
            export_yup=True,export_extras=True,export_cameras=False,export_lights=False,
            export_materials='EXPORT',export_image_format='AUTO',export_image_quality=92)
        raw=target.read_bytes();json_size=struct.unpack_from('<I',raw,12)[0]
        gltf=json.loads(raw[20:20+json_size])
        emitted_triangles=sum(gltf['accessors'][p['indices']]['count']//3 for mesh in gltf.get('meshes',[]) for p in mesh['primitives'] if p.get('mode',4)==4 and 'indices' in p)
        emitted_vertices=sum(gltf['accessors'][p['attributes']['POSITION']]['count'] for mesh in gltf.get('meshes',[]) for p in mesh['primitives'])
        text=json.dumps(exhibition,ensure_ascii=False,indent=2)
        (PUBLIC/'data'/'exhibition.json').write_text(text,encoding='utf-8')
        (ROOT/'data'/'exhibition.json').write_text(text,encoding='utf-8')
        report={'schemaVersion':1,'file':str(target),'bytes':target.stat().st_size,'artworks':len(exhibition['artworks']),
                'vertices':emitted_vertices,'triangles':emitted_triangles,'sourceVertices':vertices,'sourceTriangles':triangles,'baked':not args.no_bake,'atlases':atlases,
                'atlasSize':args.atlas_size if atlases else None,'samples':args.samples if atlases else None,
                'webTextureFormat':'JPEG','webTextureQuality':92,'atlasSourceFormat':'PNG' if atlases else None,
                'lightingDenoiser':'OpenImageDenoise RT high, linear RGB' if atlases else None,
                'denoisedAtlases':[str(RAW_ATLASES/('lighting-'+group+'-denoised.png')) for group in ('room-a','corridor','room-b')] if atlases else [],
                'visitImageMaxSide':1536,'visitImagesResized':resized,
                'pbrImageMaxSide':1024,'pbrMapsPrepared':pbr_maps,'pbrMapBitDepth':8,
                'normalImageMaxSide':512,'alphaImageMaxSide':512,
                'durationSeconds':round(time.time()-start,2),'warnings':warnings,
                'sourceSHA256':source_hash,'sourceUnchanged':source_hash==hashlib.sha256(source_file.read_bytes()).hexdigest() if source_hash else None,
                'navigation':{k:len(exhibition['navigation'][k]) for k in ('boxes','orientedBoxes','circles','walkable')}}
        REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print('EXPORT_REPORT',json.dumps(report),flush=True)
    finally:
        bpy.context.window.scene=source
        for ob in list(tmp.objects):bpy.data.objects.remove(ob,do_unlink=True)
        bpy.data.scenes.remove(tmp)
    # No save_as_mainfile: source remains untouched.

if __name__=='__main__':main()
