"""Build the editable Luz y color gallery in Blender. Run with bpy or from Blender Text Editor.

The original user's collection is preserved and hidden. Only this script's Gallery and
Navigation collections are replaced on rerun. Dimensions are metres.
"""
import bpy
import math
import json
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data' / 'exhibition.json'
BLEND = ROOT / 'blender' / 'gallery.blend'
WEB = ROOT / 'web' / 'public'
H = 4.8
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

for name in ('Gallery', 'Navigation'):
    old = bpy.data.collections.get(name)
    if old:
        for obj in list(old.all_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
for coll in scene.collection.children:
    coll.hide_render = True
    coll.hide_viewport = True
gallery = bpy.data.collections.new('Gallery')
scene.collection.children.link(gallery)
navigation = bpy.data.collections.new('Navigation')
scene.collection.children.link(navigation)
navigation.hide_render = True
navigation.hide_viewport = True

def material(name, color, roughness=.7, metallic=0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    mat.diffuse_color = (*color, 1)
    return mat

M = {
    'wall': material('MAT_Wall', (.82,.80,.75), .82),
    'floor': material('MAT_Floor', (.48,.46,.41), .29),
    'ceiling': material('MAT_Ceiling', (.86,.84,.79), .88),
    'panel': material('MAT_Panel', (.86,.84,.80), .77),
    'metal': material('MAT_Metal', (.032,.040,.045), .28,.78),
    'concrete': material('MAT_Concrete', (.45,.43,.39), .88),
    'wood': material('MAT_Wood', (.25,.115,.045), .45),
    'glass': material('MAT_Glass', (.78,.90,.98), .08),
    'grass': material('MAT_Grass', (.15,.22,.105), .95),
    'leaf': material('MAT_Leaves', (.12,.24,.085), .91),
    'gravel': material('MAT_Gravel', (.30,.31,.27), .94),
    'paper': material('MAT_Paper', (.91,.89,.84), .93),
    'ink': material('MAT_Ink', (.035,.035,.04), .8),
    'gold': material('MAT_Frame_Gold', (.55,.36,.13), .30,.82),
    'white': material('MAT_Frame_White', (.87,.85,.80), .50),
    'accent': material('MAT_Accent', (.24,.04,.17), .6),
    'led': material('MAT_LED', (.95,.88,.70), .4),
}
glass_shader = next(n for n in M['glass'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
glass_shader.inputs['Transmission Weight'].default_value = 1
glass_shader.inputs['IOR'].default_value = 1.45
led_shader = next(n for n in M['led'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
led_shader.inputs['Emission Color'].default_value = (1,.90,.72,1)
led_shader.inputs['Emission Strength'].default_value = 3

boxes, circles, walkable = [], [], []
def vec(p):
    return (p[0], -p[2], p[1])

def box(name, pos, size, mat, bevel=.012, parent=None, local=False):
    # Inputs use Blender coordinates and dimensions, permitting simple hierarchy edits.
    sx, sy, sz = [v/2 for v in size]
    verts = [(-sx,-sy,-sz),(sx,-sy,-sz),(sx,sy,-sz),(-sx,sy,-sz),
             (-sx,-sy,sz),(sx,-sy,sz),(sx,sy,sz),(-sx,sy,sz)]
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    mesh = bpy.data.meshes.new(name+'_Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    gallery.objects.link(ob)
    ob.location = pos
    if parent: ob.parent = parent
    ob.data.materials.append(mat)
    if bevel:
        mod = ob.modifiers.new('Edge finishing', 'BEVEL')
        mod.width = min(bevel, min(size)/4)
        mod.segments = 2
        mod = ob.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    ob['galleryRole'] = name.split('_')[0].lower()
    ob['webBake'] = mat.name in ('MAT_Wall','MAT_Floor','MAT_Ceiling','MAT_Concrete','MAT_Panel')
    return ob

def box3(name, x,y,z, sx,sy,sz, mat, bevel=.012):
    return box(name, vec((x,y,z)), (sx,sz,sy), mat, bevel)

def collider(x,z,sx,sz):
    boxes.append({'minX':x-sx/2,'maxX':x+sx/2,'minZ':z-sz/2,'maxZ':z+sz/2})

def wall(name,x,z,sx,sz):
    ob=box3('Wall_'+name,x,H/2,z,sx,H,sz,M['wall'])
    collider(x,z,sx,sz)
    # Dark shadow gap at floor meets a pale skirting above it.
    box3('Skirting_'+name,x,.07,z,sx+.008,.14,sz+.008,M['concrete'],.004)
    return ob

def rect(name,x1,x2,z1,z2):
    box3('Floor_'+name,(x1+x2)/2,-.08,(z1+z2)/2,x2-x1,.16,z2-z1,M['floor'])
    box3('Ceiling_'+name,(x1+x2)/2,H+.15,(z1+z2)/2,x2-x1,.3,z2-z1,M['ceiling'])
    walkable.append({'x1':x1,'x2':x2,'z1':z1,'z2':z2})
    # Fine floor seams are separate editable strips; no topological splitting needed.
    for x in range(math.ceil(x1/2)*2,math.floor(x2)+1,2):
        box3('FloorJoint_'+name+'_'+str(x),x,.002,(z1+z2)/2,.003,.002,z2-z1,M['concrete'],0)

rect('Room_A',-22.15,-5.85,-9.15,9.15)
rect('Corridor',-6,6,-3.5,3.5)
rect('Room_B',5.85,22.15,-9.15,9.15)
for args in [('A_West',-22,0,.3,18.3),('A_South',-14,9,16.3,.3),
             ('A_East_S',-6,6.325,.3,5.65),('A_East_N',-6,-6.325,.3,5.65),
             ('B_East',22,0,.3,18.3),('B_South',14,9,16.3,.3),
             ('B_West_S',6,6.325,.3,5.65),('B_West_N',6,-6.325,.3,5.65),
             ('Corridor_South',0,3.65,12,.3)]:
    wall(*args)

def cylinder(name,pos,radius,depth,mat,verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=pos)
    ob=bpy.context.object
    ob.name=name
    for c in list(ob.users_collection): c.objects.unlink(ob)
    gallery.objects.link(ob)
    ob.data.materials.append(mat)
    for poly in ob.data.polygons: poly.use_smooth = True
    bevel=ob.modifiers.new('Edge finishing','BEVEL'); bevel.width=.009; bevel.segments=2
    ob['galleryRole']=name.split('_')[0].lower()
    ob['webBake']=mat.name=='MAT_Concrete'
    return ob

for idx,(x,z) in enumerate([(-18,-6),(-10,-6),(-18,6),(-10,6),(10,-6),(18,-6),(10,6),(18,6),(-2,-2.6),(2,-2.6),(-2,2.6),(2,2.6)]):
    cylinder('Column_%02d'%idx,vec((x,H/2,z)),.28,H,M['concrete'])
    cylinder('ColumnFoot_%02d'%idx,vec((x,.045,z)),.295,.09,M['metal'])
    circles.append({'x':x,'z':z,'r':.28})

for tag,x1,x2,z in [('A',-22,-6,-9),('B',6,22,-9),('Corridor',-6,6,-3.5)]:
    count=round((x2-x1)/4)
    for i in range(count):
        a=x1+(x2-x1)*i/count; b=x1+(x2-x1)*(i+1)/count
        pane=box3('WindowPane_'+tag+'_'+str(i),(a+b)/2,H/2,z,b-a-.09,H-.18,.012,M['glass'],0)
        pane['galleryRole']='glass'
    for i in range(count+1):
        box3('WindowMullion_'+tag+'_'+str(i),x1+(x2-x1)*i/count,H/2,z,.09,H,.16,M['metal'])
    for y in (.07,H-.07):
        box3('WindowRail_'+tag+'_'+str(y),(x1+x2)/2,y,z,x2-x1,.14,.17,M['metal'])
    collider((x1+x2)/2,z,x2-x1+.2,.2)

panel_roots=[]
for tag,x,z,sx,sz in [('A_N',-14,-2.5,6,.16),('A_S',-14,3,6,.16),('B',14,0,.16,8)]:
    root=bpy.data.objects.new('Panel_'+tag,None); gallery.objects.link(root); root.location=vec((x,0,z))
    root['galleryRole']='panel'; root['moduleId']='panel-'+tag
    box('PanelBody_'+tag,(0,0,1.7),(sx,sz,3.4),M['panel'],.018,parent=root)
    box('PanelPlinth_'+tag,(0,0,.05),(sx+.05,sz+.05,.1),M['metal'],.009,parent=root)
    collider(x,z,sx+.05,sz+.05)
    panel_roots.append(root)

for tag,x,z in [('A',-19.6,0),('B',10.6,0)]:
    root=bpy.data.objects.new('Bench_'+tag,None); gallery.objects.link(root); root.location=vec((x,0,z))
    box('BenchSeat_'+tag,(0,0,.46),(.54,3,.09),M['wood'],.02,parent=root)
    for s in (-1,1):
        box('BenchLeg_'+tag+str(s),(0,s*1.24,.225),(.43,.07,.45),M['metal'],.008,parent=root)
        box('BenchFoot_'+tag+str(s),(0,s*1.24,.025),(.46,.12,.05),M['metal'],.004,parent=root)
    collider(x,z,.59,3.05)

for room,cx in [('A',-14),('B',14),('Corridor',0)]:
    zvals=[-6,-2,2,6] if room!='Corridor' else [-1.6,1.6]
    length=15 if room!='Corridor' else 11
    for z in zvals:
        box3('LuminaireHousing_'+room+str(z),cx,H-.02,z,length+.12,.06,.22,M['metal'],.008)
        box3('LuminaireDiffuser_'+room+str(z),cx,H-.058,z,length,.012,.09,M['led'],.003)

# Exterior: restrained sculpture garden, planted borders and terrace paving.
box3('Exterior_Ground',0,-.21,-25,150,.18,110,M['grass'],0)
for tag,cx in [('A',-14),('B',14)]:
    box3('Exterior_Terrace_'+tag,cx,-.065,-10.6,16.3,.13,3.0,M['concrete'])
box3('Exterior_Path',0,-.08,-11,12,.12,16,M['gravel'])
rng=random.Random(42)
for i in range(20):
    x=-45+i*4.8+rng.uniform(-1,1); z=-18-rng.uniform(0,11)
    height=rng.uniform(3.6,6.4)
    cylinder('Exterior_Trunk_%02d'%i,vec((x,height*.33,z)),.10,height*.66,M['wood'],12)
    for j in range(3):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=vec((x+rng.uniform(-.5,.5),height*(.65+j*.12),z+rng.uniform(-.6,.6))))
        ob=bpy.context.object; ob.name='Exterior_Canopy_%02d_%d'%(i,j)
        for c in list(ob.users_collection): c.objects.unlink(ob)
        gallery.objects.link(ob); ob.scale=(1.4,1.25,1.1); ob.data.materials.append(M['leaf'])
        for poly in ob.data.polygons: poly.use_smooth=True
for i in range(9):
    x=-90+i*23; height=rng.uniform(10,21)
    box3('Exterior_DistantArchitecture_%02d'%i,x,height/2-.15,-85,12,height,15,M['concrete'],.03)

def text(name,body,size,pos,mat,parent=None):
    curve=bpy.data.curves.new(name,'FONT'); curve.body=body; curve.size=size
    curve.extrude=.00015; curve.space_line=1.2
    ob=bpy.data.objects.new(name,curve); gallery.objects.link(ob)
    ob.location=pos; ob.rotation_euler=(math.pi/2,0,0); ob.data.materials.append(mat)
    if parent: ob.parent=parent
    return ob

def plane(name,w,h,depth,mat,parent):
    mesh=bpy.data.meshes.new(name+'_Mesh')
    mesh.from_pydata([(-w/2,-depth,-h/2),(w/2,-depth,-h/2),(w/2,-depth,h/2),(-w/2,-depth,h/2)],[],[(0,1,2,3)])
    mesh.update(); uv=mesh.uv_layers.new(name='UVMap')
    for loop,p in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]): loop.uv=p
    ob=bpy.data.objects.new(name,mesh); gallery.objects.link(ob); ob.parent=parent; ob.data.materials.append(mat)
    return ob

exhibition=json.loads(DATA.read_text(encoding='utf-8-sig'))
missing=[]
for art in exhibition['artworks']:
    aid=art['id']; x,y,z=art['position']; root=bpy.data.objects.new('Artwork_'+aid,None)
    gallery.objects.link(root); root.location=vec((x,y,z)); root.rotation_euler.z=art['rotation']
    root['artworkId']=aid; root['galleryRole']='artwork'; root['title']=art['title']; root['artist']=art['artist']
    root['year']=str(art['year']); root['description']=art.get('description','')
    root['source']=art.get('imageUrl',''); root['image']=art['image']; root['width']=art['width']; root['height']=art['height']
    width,height=art['width'],art['height']; image_path=WEB/art['image']
    mat=material('MAT_Painting_'+aid,(.7,.7,.7),.82)
    if image_path.exists():
        image=bpy.data.images.load(str(image_path),check_existing=True)
        iw,ih=image.size
        if iw and ih:
            if iw/ih>width/height: height=width*ih/iw
            else: width=height*iw/ih
        mat.node_tree.nodes.clear()
        out=mat.node_tree.nodes.new('ShaderNodeOutputMaterial'); shader=mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Roughness'].default_value=.82
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
        mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
        mat.node_tree.links.new(shader.outputs[0],out.inputs['Surface'])
    else: missing.append(aid)
    plane('Painting_'+aid,width,height,.042,mat,root)
    plane('PassePartout_'+aid,width+.10,height+.10,.03,M['paper'],root)
    fmat=M.get(art.get('frame','metal'),M['metal'])
    ow,oh=width+.10,height+.10; fb=.045
    for tag,pos,size in [('Top',(0,-.035,oh/2+fb/2),(ow+fb*2,.07,fb)),
                         ('Bottom',(0,-.035,-oh/2-fb/2),(ow+fb*2,.07,fb)),
                         ('Left',(-ow/2-fb/2,-.035,0),(fb,.07,oh)),
                         ('Right',(ow/2+fb/2,-.035,0),(fb,.07,oh))]:
        box('Frame_'+aid+'_'+tag,pos,size,fmat,.006,parent=root)
    lx=ow/2+fb+.30; lz=1.35-y
    label=box('LabelBoard_'+aid,(lx,-.007,lz),(.40,.014,.25),M['paper'],.003,parent=root)
    title=art['title']
    # A short physical cartela complements the full accessible web description.
    import textwrap
    body='\n'.join(textwrap.wrap(title,27))+'\n'+art['artist']+'\n'+str(art['year'])
    text('LabelText_'+aid,body,.018,(lx-.18,-.016,lz+.082),M['ink'],root)
    safe=bpy.data.objects.new('Observation_'+aid,None); navigation.objects.link(safe)
    nx,nz=math.sin(art['rotation']),math.cos(art['rotation'])
    safe.parent=root; safe.location=(0,-2.2,1.65-y); safe['artworkId']=aid
    # Attach panel-hung works while preserving their current world transform.
    bpy.context.view_layer.update()
    for panel in panel_roots:
        px,py,pz=panel.location
        if abs(x-px)<4.1 and abs((-z)-py)<.2:
            matrix=root.matrix_world.copy(); root.parent=panel; root.matrix_world=matrix; break
        if panel.name=='Panel_B' and abs(x-px)<.2 and abs((-z)-py)<4.1:
            matrix=root.matrix_world.copy(); root.parent=panel; root.matrix_world=matrix; break

# Architectural exhibition title on the western wall, facing the gallery.
sign=bpy.data.objects.new('ExhibitionSign',None); gallery.objects.link(sign)
sign.location=vec((-21.81,3.0,0)); sign.rotation_euler.z=math.pi/2
box('ExhibitionSignBoard',(0,-.015,0),(8,.03,2.7),M['accent'],.025,parent=sign)
text('ExhibitionSignKicker','GALERIA / EXPOSICION',.105,(-3.5,-.04,.83),M['paper'],sign)
text('ExhibitionSignTitle','Luz y color',.68,(-3.5,-.042,-.03),M['paper'],sign)
text('ExhibitionSignSubtitle','Una visita a la pintura moderna',.14,(-3.48,-.04,-.90),M['paper'],sign)

spawn=bpy.data.objects.new('VisitorStart',None); navigation.objects.link(spawn)
spawn.location=vec((0,1.65,0)); spawn['yaw']=math.pi/2
scene['gallery_navigation']=json.dumps({'boxes':boxes,'circles':circles,'walkable':walkable})
scene['gallery_title']='Luz y color'; scene['gallery_schema_version']=1
scene['gallery_source']=str(DATA); scene['gallery_coordinates']='Three(x,y,z) = Blender(x,z,-y)'
scene['gallery_export_ready']=True
camera_data=bpy.data.cameras.new('GalleryPreview')
preview=bpy.data.objects.new('GalleryPreview',camera_data); gallery.objects.link(preview)
preview.location=vec((-20,1.9,7))
preview.rotation_euler=(Vector(vec((-12,1.8,-2)))-preview.location).to_track_quat('-Z','Y').to_euler()
camera_data.lens=22; camera_data.clip_end=250
scene.camera=preview
for obj in gallery.all_objects: obj.hide_set(False)
bpy.ops.object.select_all(action='DESELECT')
for ob in gallery.all_objects:
    if ob.type=='MESH' and ob.name.startswith('Floor_'): ob.select_set(True)
bpy.context.view_layer.update()
BLEND.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
print(json.dumps({'saved':str(BLEND),'objects':len(gallery.all_objects),'artworks':len(exhibition['artworks']),'missingTextures':missing,'colliders':len(boxes),'columns':len(circles)}))
