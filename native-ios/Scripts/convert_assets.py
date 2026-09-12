"""Run with Blender --background --python. Original glTF -> native USDZ + per-clip animations."""
import bpy, json, math, pathlib, hashlib
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'native-ios/Slouch/GameResources/Models'
OUT.mkdir(parents=True,exist_ok=True)
manifest={}
for src in sorted((ROOT/'assets').rglob('*.glb')):
    key=str(src.relative_to(ROOT/'assets').with_suffix('')).replace('/','__')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(src))
    # glTF importer stores each clip in muted NLA tracks; select one at a time for USD animation.
    tracks={}
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data.action=None
            for t in obj.animation_data.nla_tracks:
                t.mute=True
                tracks.setdefault(t.name.split('|')[-1],[]).append(t)
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    # Blender imports Y-up glTF as Z-up; measure evaluated/skinned vertices then map back to Y-up.
    deps=bpy.context.evaluated_depsgraph_get(); pts=[]
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH': continue
        ev=obj.evaluated_get(deps); mesh=ev.to_mesh()
        pts.extend([ev.matrix_world @ v.co for v in mesh.vertices]); ev.to_mesh_clear()
    if not pts: raise RuntimeError(f'No geometry: {src}')
    pts=[Vector((p.x,p.z,-p.y)) for p in pts]
    lo=Vector(tuple(min(p[i] for p in pts) for i in range(3))); hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    size=hi-lo; center=(lo+hi)/2
    def export(name,clip=None):
        for ts in tracks.values():
            for t in ts:t.mute=True
        if clip:
            for t in tracks[clip]:t.mute=False
            strips=[s for t in tracks[clip] for s in t.strips]
            bpy.context.scene.frame_start=int(min(s.frame_start for s in strips)); bpy.context.scene.frame_end=int(max(s.frame_end for s in strips))
        else:bpy.context.scene.frame_start=0;bpy.context.scene.frame_end=0
        bpy.context.scene.frame_set(bpy.context.scene.frame_start)
        dst=OUT/(name+'.usdz')
        bpy.ops.wm.usd_export(filepath=str(dst),export_animation=bool(clip),export_armatures=True,export_shapekeys=True,convert_orientation=True,export_global_forward_selection='NEGATIVE_Z',export_global_up_selection='Y',export_textures_mode='NEW',generate_preview_surface=True,root_prim_path='/Slouch',export_cameras=False,export_lights=False,export_custom_properties=False)
        return dst.name
    entry={'source':str(src.relative_to(ROOT)), 'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'size':list(size),'center':list(center),'radius':size.length/2,'file':export(key),'clips':{}}
    # Only clips referenced by original game; retain names for native animation state machine.
    wanted={'Run','Jump','Jump_Idle','Jump_Land','Duck','Idle','Swimming_Normal','Swimming_Fast','Gallop','Swim'}
    for clip in tracks:
        if clip in wanted:entry['clips'][clip]=export(key+'--'+clip,clip)
    manifest[key]=entry
    print('SLOUCH_ASSET '+key+' '+','.join(entry['clips']),flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('SLOUCH_ASSETS_COMPLETE '+str(len(manifest)),flush=True)
