"""Read-only validation of the saved source model and computed web metadata.

blender -b gallery.blend -P validate_gallery.py
"""
import bpy
import runpy
import json
from pathlib import Path

source=Path(__file__).resolve().parent/'export_gallery.py'
api=runpy.run_path(str(source),run_name='gallery_export_helpers')
data,warnings=api['scene_data'](bpy.context.scene)
missing=[]
for image in bpy.data.images:
    if image.source=='FILE' and not image.packed_file:
        path=Path(bpy.path.abspath(image.filepath))
        if not path.exists():missing.append(str(path))
if missing:raise RuntimeError('Missing image resources: '+str(missing))
result={'valid':True,'artworks':len(data['artworks']),'imagesMissing':missing,'warnings':warnings,
        'navigation':{k:len(data['navigation'][k]) for k in ('boxes','orientedBoxes','circles','walkable')}}
print('VALIDATION_REPORT',json.dumps(result,ensure_ascii=False))
