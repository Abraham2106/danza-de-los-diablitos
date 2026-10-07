"""Editable, repeatable furnishing pass; preserves artworks and architecture.
Run after finish_gallery.py. All coordinates below are Blender metres.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
scene=bpy.context.scene
gallery=bpy.data.collections['Gallery']
old=bpy.data.collections.get('GalleryFurnishings')
if old:
    for obj in list(old.objects): bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(old)
decor=bpy.data.collections.new('GalleryFurnishings');gallery.children.link(decor)
for obj in list(bpy.data.objects):
    if obj.name.startswith(('Column_','ColumnFoot_')):bpy.data.objects.remove(obj,do_unlink=True)

def material(name,color,roughness=.7,metallic=0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness
    p.inputs['Metallic'].default_value=metallic;m.diffuse_color=(*color,1)
    # Broad, quiet color variation, never high frequency grit.
    if name in ('MAT_Wall','MAT_Panel'):
        for link in list(p.inputs['Normal'].links):m.node_tree.links.remove(link)
    return m

material('MAT_Wall',(.52,.53,.505),.82)
material('MAT_Panel',(.62,.605,.57),.8)
clay=material('DECOR_Terracotta',(.32,.075,.033),.4)
stone=material('DECOR_Limestone',(.46,.435,.37),.74)
bronze=material('DECOR_Bronze',(.18,.115,.05),.32,.72)
pot=material('DECOR_Pot',(.065,.081,.077),.7)
leaf=material('DECOR_Leaf',(.035,.115,.061),.66)
leaf_light=material('DECOR_LeafLight',(.08,.19,.084),.72)
soil=material('DECOR_Soil',(.028,.021,.014),.98)
cord=material('DECOR_Cord',(.025,.032,.03),.92)

def collect(obj,name,mat,collider=False):
    obj.name=name
    for col in list(obj.users_collection):col.objects.unlink(obj)
    decor.objects.link(obj);obj.data.materials.append(mat)
    obj['galleryRole']='furnishing';obj['decorCollider']=collider
    return obj

def box(name,pos,size,mat,collider=False):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=collect(bpy.context.object,name,mat,collider)
    o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    b=o.modifiers.new('Soft edges','BEVEL');b.width=.015;b.segments=3
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o

def cylinder(name,pos,r,depth,mat,collider=False,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=pos)
    o=collect(bpy.context.object,name,mat,collider)
    for face in o.data.polygons:face.use_smooth=True
    return o

def tube(name,points,r,mat):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=1;c.bevel_depth=r;c.bevel_resolution=2
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    o=bpy.data.objects.new(name,c);decor.objects.link(o);o.data.materials.append(mat)
    # Convert to mesh for portable glTF and predictable picking.
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH');return bpy.context.object

# One central support replaces the twelve columns that obstructed the artworks.
center=cylinder('Column_Center',(0,0,2.4),.28,4.8,bpy.data.materials['MAT_Concrete'])
center['webBake']=True
cylinder('ColumnFoot_Center',(0,0,.045),.295,.09,bpy.data.materials['MAT_Metal'])
start=bpy.data.objects.get('VisitorStart')
if start:start.location=(-4.5,0,1.65)

rng=random.Random(92)
for i,(x,y) in enumerate([(-20.8,7.5),(-7.4,-7.5),(7.4,7.5),(20.8,-7.5)]):
    cylinder('Decor_Planter_%02d'%i,(x,y,.33),.30,.66,pot,True,r2=.38)
    cylinder('Decor_Soil_%02d'%i,(x,y,.665),.34,.02,soil)
    for j in range(9):
        a=j*2.399;top=.95+rng.random()*.95;spread=.24+rng.random()*.35
        end=Vector((x+math.cos(a)*spread,y+math.sin(a)*spread,top))
        tube('Decor_Stem_%d_%d'%(i,j),[(x,y,.66),((x+end.x)/2,(y+end.y)/2,top*.8),end],.013,leaf)
        # Curved, tapered botanical blade with visible midrib and solid silhouette.
        direction=Vector((math.cos(a),math.sin(a),.5));side=Vector((-math.sin(a),math.cos(a),0))
        verts=[];faces=[]
        for k in range(9):
            t=k/8;center=end+direction*(t*.65)+Vector((0,0,.2*math.sin(math.pi*t)))
            width=.14*math.sin(math.pi*t)
            verts.extend([center-side*width,center+Vector((0,0,.035*math.sin(math.pi*t))),center+side*width])
        for k in range(8):
            q=k*3;faces.extend([(q,q+3,q+4,q+1),(q+1,q+4,q+5,q+2)])
        mesh=bpy.data.meshes.new('Botanical blade');mesh.from_pydata(verts,[],faces);mesh.update()
        o=bpy.data.objects.new('Decor_Leaf_%d_%d'%(i,j),mesh);decor.objects.link(o)
        m=leaf if j%3 else leaf_light;m.use_backface_culling=False;o.data.materials.append(m)
        for f in mesh.polygons:f.use_smooth=True

for i,(x,y) in enumerate([(-8.5,0),(18,1.8)]):
    # Low stone plinth and a restrained original sculptural study, not a stock prop.
    box('Decor_Plinth_%d'%i,(x,y,.34),(1.16,1.16,.68),stone,True)
    for j in range(2):
        pts=[]
        for k in range(97):
            a=k/96*math.tau
            if i==0: p=(x+.36*math.cos(a),y+(j-.5)*.23+.13*math.sin(2*a),1.48+.65*math.sin(a))
            else:p=(x+(j-.5)*.27+.12*math.sin(2*a),y+.33*math.cos(a),1.42+.60*math.sin(a))
            pts.append(p)
        tube('Decor_Sculpture_%d_%d'%(i,j),pts,.085,clay if i==0 else bronze)
    corners=[(x-.95,y-.95),(x+.95,y-.95),(x+.95,y+.95),(x-.95,y+.95)]
    for j,(px,py) in enumerate(corners):
        cylinder('Decor_Stanchion_%d_%d'%(i,j),(px,py,.45),.024,.9,bronze)
        cylinder('Decor_StanchionFoot_%d_%d'%(i,j),(px,py,.03),.11,.06,bronze)
    for j in range(4):
        a,b=corners[j],corners[(j+1)%4]
        tube('Decor_Rope_%d_%d'%(i,j),[(a[0]+(b[0]-a[0])*t/20,a[1]+(b[1]-a[1])*t/20,.84-.13*math.sin(math.pi*t/20)) for t in range(21)],.014,cord)
    # Navigation uses the whole protected footprint, including the ropes.
    plinth=bpy.data.objects['Decor_Plinth_%d'%i]
    plinth['decorMargin']=.76

# Oak slats create a warm, legible welcome wall in the corridor, behind artworks.
wood=bpy.data.materials['MAT_Wood']
for i in range(12):
    box('Decor_OakSlat_%02d'%i,(-4.9+i*.15,-3.477,1.45),(.06,.055,2.9),wood)

# Landscape layers: low stone beds and paths near the glass soften the empty field.
for i,x in enumerate([-24,-14,14,24]):
    box('Exterior_GardenBed_%d'%i,(x,15,-.01),(4.4,2,.22),stone)
    for j in range(4):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x-1.5+j,15,.37))
        o=collect(bpy.context.object,'Exterior_Shrub_%d_%d'%(i,j),leaf_light);o.scale=(.55,.62,.5)
        for f in o.data.polygons:f.use_smooth=True
scene['gallery_furnishing_revision']='Warm grey plaster, oak slats, botanical planters, two original sculptural studies, bronze rope stanchions, courtyard beds.'
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/'gallery.blend'))
print('PERSONALITY_DONE',len(decor.objects),flush=True)
