"""Install the twelve supplied Boruca photographs in the saved gallery.

Run after preparing data/boruca-import.json and data/exhibition.json.
Keeps the architecture, lights, furnishings and existing panel transforms.
"""
import bpy,json,textwrap
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
plan=json.loads((ROOT/'data/boruca-import.json').read_text(encoding='utf-8'))
arts={a['id']:a for a in json.loads((ROOT/'data/exhibition.json').read_text(encoding='utf-8'))['artworks']}
gallery=bpy.data.collections['Gallery'];navigation=bpy.data.collections['Navigation']
already_boruca=bpy.context.scene.get('gallery_title')=='Baile de los Diablitos'
placements={}
for p in plan:
 previous=bpy.data.objects['Artwork_'+(p['id'] if already_boruca else p['slot'])]
 placements[p['id']]=(previous.matrix_world.copy(),previous.parent)
for root in [o for o in bpy.data.objects if o.name.startswith('Artwork_')]:
 for child in list(root.children_recursive):bpy.data.objects.remove(child,do_unlink=True)
 bpy.data.objects.remove(root,do_unlink=True)
for mat in list(bpy.data.materials):
 if mat.name.startswith('MAT_Painting_') and mat.users==0:bpy.data.materials.remove(mat)
for image in list(bpy.data.images):
 if image.name.startswith('art-') and image.users==0:bpy.data.images.remove(image)

def box(name,pos,size,mat,parent,bevel=.006):
 sx,sy,sz=[v/2 for v in size]
 verts=[(-sx,-sy,-sz),(sx,-sy,-sz),(sx,sy,-sz),(-sx,sy,-sz),(-sx,-sy,sz),(sx,-sy,sz),(sx,sy,sz),(-sx,sy,sz)]
 mesh=bpy.data.meshes.new(name+'_Mesh');mesh.from_pydata(verts,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);mesh.update()
 ob=bpy.data.objects.new(name,mesh);gallery.objects.link(ob);ob.parent=parent;ob.location=pos;mesh.materials.append(mat)
 if bevel:
  mod=ob.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=3
 return ob

def plane(name,w,h,depth,mat,parent):
 mesh=bpy.data.meshes.new(name+'_Mesh');mesh.from_pydata([(-w/2,-depth,-h/2),(w/2,-depth,-h/2),(w/2,-depth,h/2),(-w/2,-depth,h/2)],[],[(0,1,2,3)]);mesh.update()
 uv=mesh.uv_layers.new(name='UVMap')
 for loop,coordinate in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=coordinate
 ob=bpy.data.objects.new(name,mesh);gallery.objects.link(ob);ob.parent=parent;mesh.materials.append(mat)
 return ob

for item in plan:
 aid=item['id'];a=arts[aid];matrix,parent=placements[aid]
 root=bpy.data.objects.new('Artwork_'+aid,None);gallery.objects.link(root);root.parent=parent;root.matrix_world=matrix
 for key in ['title','artist','year','description','source','image','width','height']:root[key]=a[key]
 root['artworkId']=aid;root['galleryRole']='artwork'
 image=bpy.data.images.load(str(ROOT/'artworks/boruca-originals'/Path(item['original']).name),check_existing=True);image.pack()
 image.filepath='//../artworks/boruca-originals/'+Path(item['original']).name
 mat=bpy.data.materials.new('MAT_Painting_'+aid);mat.use_nodes=True
 shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');shader.inputs['Roughness'].default_value=.82
 shader.inputs['Specular IOR Level'].default_value=.15
 tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
 w,h=item['width'],item['height'];plane('Painting_'+aid,w,h,.042,mat,root)
 paper=bpy.data.materials['MAT_Paper'];plane('PassePartout_'+aid,w+.10,h+.10,.03,paper,root)
 ow,oh=w+.10,h+.10;fb=.045
 for tag,pos,size in [('Top',(0,-.035,oh/2+fb/2),(ow+2*fb,.07,fb)),('Bottom',(0,-.035,-oh/2-fb/2),(ow+2*fb,.07,fb)),('Left',(-ow/2-fb/2,-.035,0),(fb,.07,oh)),('Right',(ow/2+fb/2,-.035,0),(fb,.07,oh))]:
  box('Frame_'+aid+'_'+tag,pos,size,bpy.data.materials['MAT_Metal'],root)
 lx=ow/2+fb+.30;lz=1.35-matrix.translation.z
 box('LabelBoard_'+aid,(lx,-.007,lz),(.40,.014,.25),paper,root,.003)
 curve=bpy.data.curves.new('LabelText_'+aid+'_Text','FONT');curve.body='\n'.join(textwrap.wrap(a['title'],27))+'\nAlonso Solano\nBoruca';curve.size=.018;curve.materials.append(bpy.data.materials['MAT_Ink'])
 label=bpy.data.objects.new('LabelText_'+aid,curve);gallery.objects.link(label);label.parent=root;label.location=(lx-.18,-.016,lz+.082);label.rotation_euler.x=1.5707963267948966
 safe=bpy.data.objects.new('Observation_'+aid,None);navigation.objects.link(safe);safe.parent=root;safe.location=(0,-2.2,1.65-matrix.translation.z);safe['artworkId']=aid

scene=bpy.context.scene;scene['gallery_title']='Baile de los Diablitos'
bpy.data.objects['ExhibitionSignTitle'].data.body='Baile de los Diablitos';bpy.data.objects['ExhibitionSignTitle'].data.size=.47
bpy.data.objects['ExhibitionSignSubtitle'].data.body='Boruca / Mascaras, musica y resistencia'
bpy.data.objects['ExhibitionSignKicker'].data.body='EXPOSICION FOTOGRAFICA'
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/gallery.blend'))
print('BORUCA_IMPORT',json.dumps({'photos':len(plan),'source':bpy.data.filepath,'packedImages':all(next(n.image for n in bpy.data.objects['Painting_'+p['id']].data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE').packed_file for p in plan)}))
