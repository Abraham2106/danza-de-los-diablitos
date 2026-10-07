"""Build a closed carved relief from the user's owl-mask photograph.

Run in a separate Blender: blender -b --factory-startup -P build_owl_mask.py.
The original photograph is used unchanged as the front color texture. No AI
redesign, facial change or invented ornament is included in the final asset.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
REFERENCE=ROOT/'blender'/'owl-mask-reference.png'
PROJECT=ROOT.parent if (ROOT.parent/'package.json').exists() else ROOT/'web'
DEST=PROJECT/'public'/'models'/'boruca-owl-mask.glb'
PREVIEW=(ROOT.parent/'docs' if PROJECT==ROOT.parent else ROOT/'previews')/'mascara-buho.png'
# The editable carved object in the supplied crop, excluding people, cloth,
# foliage and the feather halo behind it. Coordinates refer to the original.
OUTLINE=[(62,49),(72,41),(112,56),(151,38),(198,34),(243,40),(285,54),
 (327,40),(355,42),(364,68),(338,98),(338,144),(344,230),(330,288),
 (316,320),(310,366),(304,430),(309,472),(300,493),(282,498),(250,510),(210,522),
 (170,506),(137,490),(99,515),(71,517),(64,492),(78,435),(79,381),
 (64,368),(74,316),(79,298),(72,270),(80,225),(71,184),(78,117),(60,70)]
SCALE=.0022

def signed_outline(x,y):
    inside=False;distance=1e6
    for a,b in zip(OUTLINE,OUTLINE[1:]+OUTLINE[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
        dx,dy=b[0]-a[0],b[1]-a[1]
        t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
        distance=min(distance,math.hypot(x-a[0]-t*dx,y-a[1]-t*dy))
    return distance if inside else -distance

def region(x,y):
    distance=signed_outline(x,y)
    # Eye openings stay inside the photographed dark areas. The mouth remains
    # a recessed surface so the original teeth and tongue remain unchanged.
    for cx,cy,rx,ry in [(161,281,20,5),(248,280,21,5)]:
        hole=(math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2)-1)*min(rx,ry)
        distance=min(distance,hole)
    return distance

def bump(x,y,cx,cy,rx,ry):return math.exp(-((x-cx)/rx)**2-((y-cy)/ry)**2)

def depths(x,y):
    dome=bump(x,y,205,297,140,245)
    back=.012+.045*dome
    front=.025+.086*dome
    # Convex owl eye rings and the projecting yellow beak.
    front+=.036*(bump(x,y,139,137,47,56)+bump(x,y,263,137,47,56))
    front+=.135*bump(x,y,197,186,18,60)
    front+=.042*(bump(x,y,153,253,43,16)+bump(x,y,250,253,43,16))
    front+=.095*bump(x,y,201,318,19,55)
    front+=.018*(bump(x,y,126,338,32,64)+bump(x,y,274,338,32,64))
    front-=.038*(bump(x,y,161,281,29,13)+bump(x,y,248,280,30,13))
    front-=.055*bump(x,y,200,401,44,28)
    return max(back+.018,front),back

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
collection=bpy.data.collections.new('BorucaOwlMaskAsset');scene.collection.children.link(collection)
root=bpy.data.objects.new('Boruca_Owl_Mask',None);collection.objects.link(root)
root['assetRole']='mask';root['reference']='User supplied owl-mask photograph';root['generatedDesign']=False

def material(name,color,roughness=.7,metallic=0):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    node=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=roughness
    node.inputs['Metallic'].default_value=metallic
    return mat,node

front_mat,node=material('OwlMask_Photograph',(.6,.4,.18),.78)
image=bpy.data.images.load(str(REFERENCE),check_existing=True);image.pack()
tex=front_mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
front_mat.node_tree.links.new(tex.outputs['Color'],node.inputs['Base Color'])
wood,_=material('OwlMask_CarvedWoodBack',(.22,.108,.041),.83)
metal,_=material('OwlMask_DisplaySupport',(.025,.029,.029),.36,.75)

uv_points=[];faces=[];lookup={}
def vertex(x,y):
    key=(round(x,6),round(y,6))
    if key not in lookup:lookup[key]=len(uv_points);uv_points.append(key)
    return lookup[key]

def triangle(points):
    # Clip each grid triangle at the actual silhouette; the outline is not
    # a rectangular transparent billboard and has genuine side and back faces.
    polygon=[]
    for i,a in enumerate(points):
        b=points[(i+1)%3];da,db=region(*a),region(*b)
        if da>=0:polygon.append(a)
        if (da>=0)!=(db>=0):
            lo,hi=a,b;dlo=da
            for _ in range(18):
                mid=((lo[0]+hi[0])/2,(lo[1]+hi[1])/2);dm=region(*mid)
                if (dm>=0)==(dlo>=0):lo=mid;dlo=dm
                else:hi=mid
            polygon.append(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2))
    if len(polygon)<3:return
    ids=[vertex(*p) for p in polygon]
    for i in range(1,len(ids)-1):
        face=(ids[0],ids[i+1],ids[i])
        if len(set(face))==3:faces.append(face)

NX,NY=90,138
for j in range(NY):
    y0,y1=34+(522-34)*j/NY,34+(522-34)*(j+1)/NY
    for i in range(NX):
        x0,x1=58+(366-58)*i/NX,58+(366-58)*(i+1)/NX
        triangle([(x0,y0),(x1,y0),(x1,y1)])
        triangle([(x0,y0),(x1,y1),(x0,y1)])

vertices=[((x-206.5)*SCALE,-depths(x,y)[0],(542-y)*SCALE+.39) for x,y in uv_points]
vertices += [((x-206.5)*SCALE,-depths(x,y)[1],(542-y)*SCALE+.39) for x,y in uv_points]
n=len(uv_points);front_count=len(faces)
edge_counts={}
for face in faces:
    for a,b in zip(face,face[1:]+face[:1]):
        key=tuple(sorted((a,b)))
        if key in edge_counts:edge_counts[key]=None
        else:edge_counts[key]=(a,b)
faces += [tuple(index+n for index in reversed(face)) for face in faces[:front_count]]
back_end=len(faces)
for edge in edge_counts.values():
    if edge:
        a,b=edge;faces.append((b,a,a+n,b+n))
mesh=bpy.data.meshes.new('OwlMask_ClosedReliefMesh');mesh.from_pydata(vertices,[],faces);mesh.update()
body=bpy.data.objects.new('OwlMask_CarvedRelief',mesh);collection.objects.link(body);body.parent=root
mesh.materials.append(front_mat);mesh.materials.append(wood)
uv=mesh.uv_layers.new(name='PhotoProjection')
for p in mesh.polygons:
    p.material_index=0 if p.index<front_count else 1;p.use_smooth=p.index<back_end
    for loop in p.loop_indices:
        x,y=uv_points[mesh.loops[loop].vertex_index%n];uv.data[loop].uv=(x/413,1-y/542)

def cylinder(name,radius,depth,z):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius,depth=depth,location=(0,.045,z))
    ob=bpy.context.object;ob.name=name
    for col in list(ob.users_collection):col.objects.unlink(ob)
    collection.objects.link(ob);ob.parent=root;ob.data.materials.append(metal)
    for p in ob.data.polygons:p.use_smooth=len(p.vertices)==4
    return ob
cylinder('OwlMask_SupportRod',.012,.79,.41)
cylinder('OwlMask_SupportBase',.17,.024,.012)

bm=bmesh.new();bm.from_mesh(mesh)
boundary=sum(1 for e in bm.edges if not e.is_manifold)
if boundary:raise RuntimeError(f'Mask must be closed: {boundary} non-manifold edges')
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
mesh.calc_loop_triangles();triangles=len(mesh.loop_triangles)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for ob in collection.objects:ob.select_set(True)
DEST.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(DEST),export_format='GLB',use_selection=True,export_extras=True,export_yup=True)

# Save a small standalone editable file; no gallery or studio geometry inside.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/'owl-mask.blend'))

# A studio preview from an oblique angle makes its relief and thickness visible.
world=scene.world or bpy.data.worlds.new('MaskStudio');scene.world=world;world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs['Color'].default_value=(.12,.14,.15,1);background.inputs['Strength'].default_value=.3
def aim(ob,point):ob.rotation_euler=(Vector(point)-ob.location).to_track_quat('-Z','Y').to_euler()
for name,position,power,size in [('Key',(-2,-3,4),380,3),('Fill',(3,-1,2),180,3),('Rim',(1,2,3),350,2)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
    ob=bpy.data.objects.new(name,light);scene.collection.objects.link(ob);ob.location=position;aim(ob,(0,0,.8))
camera=bpy.data.cameras.new('MaskPreview');ob=bpy.data.objects.new('MaskPreview',camera);scene.collection.objects.link(ob)
ob.location=(.88,-3.8,1.30);aim(ob,(0,-.02,.78));camera.type='ORTHO';camera.ortho_scale=1.85;scene.camera=ob
scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(PREVIEW)
bpy.ops.render.render(write_still=True)
report={'triangles':triangles,'vertices':len(mesh.vertices),'nonManifoldEdges':boundary,'glbBytes':DEST.stat().st_size,
 'frontTexture':'unchanged user photograph, 413 x 542','imageWidth':image.size[0],'imageHeight':image.size[1],
 'dimensionsMetres':list(body.dimensions),'sourceReference':REFERENCE.name,'standIncluded':True}
(ROOT/'blender'/'owl-mask-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('OWL_MASK_READY',json.dumps(report),flush=True)
