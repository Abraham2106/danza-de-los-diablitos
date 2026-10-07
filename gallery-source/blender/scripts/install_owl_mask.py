"""Install the finished owl-mask asset in the open editable gallery.

Run in the saved gallery, after build_owl_mask.py. Preserves the architecture,
paintings, lights, plinths and rope barriers. The operation can be repeated.
"""
import bpy, math, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
PROJECT=ROOT.parent if (ROOT.parent/'package.json').exists() else ROOT/'web'
GLB=PROJECT/'public'/'models'/'boruca-owl-mask.glb'
decor=bpy.data.collections.get('GalleryFurnishings')
if not decor:raise RuntimeError('Open the editable gallery before installing its mask asset')
remove=[ob for ob in bpy.data.objects if ob.name.startswith(('Decor_Sculpture_','Decor_BorucaOwlMask_','Decor_Leaf_1_','Decor_Stem_1_'))
        or ob.name in ('Decor_Planter_01','Decor_Soil_01')]
# Remove previous asset hierarchies as well as their roots on repeated installs.
for ob in list(remove):
    if ob.name.startswith('Decor_BorucaOwlMask_'):remove.extend(ob.children_recursive)
for name in {ob.name for ob in remove}:
    ob=bpy.data.objects.get(name)
    if ob:bpy.data.objects.remove(ob,do_unlink=True)
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(GLB))
imported=[ob for ob in bpy.data.objects if ob not in before]
root=next(ob for ob in imported if ob.parent not in imported)
root.name='Decor_BorucaOwlMask_0'
for ob in imported:
    for col in list(ob.users_collection):col.objects.unlink(ob)
    decor.objects.link(ob);ob['galleryRole']='mask'
    if ob.type=='MESH':
        for mat in ob.data.materials:
            if mat and mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if node.type=='TEX_IMAGE' and node.image and not node.image.packed_file:node.image.pack()
plinth=bpy.data.objects['Decor_Plinth_0']
root.rotation_mode=next(i.identifier for i in bpy.types.Object.bl_rna.properties['rotation_mode'].enum_items if i.identifier=='XYZ')
root.location=(plinth.location.x,plinth.location.y,.68);root.rotation_euler.z=math.pi/2
mapping={}
for ob in imported:
    copy=ob.copy();decor.objects.link(copy);mapping[ob]=copy
for ob,copy in mapping.items():copy.parent=mapping.get(ob.parent)
second=mapping[root];second.name='Decor_BorucaOwlMask_1'
plinth=bpy.data.objects['Decor_Plinth_1'];second.location=(plinth.location.x,plinth.location.y,.68);second.rotation_euler.z=-math.pi/2
bpy.context.scene['maskAssetRevision']='User owl-mask reference, carved relief, two linked copies; planter 01 removed'
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/'gallery.blend'))
print('OWL_MASK_INSTALLED',json.dumps({'copies':[root.name,second.name],'removedObjects':len(remove),'file':bpy.data.filepath}),flush=True)
