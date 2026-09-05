// Authored route chunks assembled from the existing licensed models.
// Visual randomness is independent of gameplay seeds; decorations never enter the corridor.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { spawnCreature } from './packs.js';
import { mulberry32 } from './rng.js';
const cache = new Map();
const loader = new GLTFLoader();
async function rockPrototype() {
  const url='assets/rock/rock1.glb';
  if(!cache.has(url)) cache.set(url,loader.loadAsync(url));
  return (await cache.get(url)).scene;
}
function rockAt(proto, length, tint) {
  const model=proto.clone(true); const box=new THREE.Box3().setFromObject(model);
  const size=box.getSize(new THREE.Vector3()), centre=box.getCenter(new THREE.Vector3());
  const scale=length/Math.max(size.x,size.y,size.z); model.position.sub(centre);
  const g=new THREE.Group();g.add(model);g.scale.setScalar(scale);
  model.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshStandardMaterial({color:tint,roughness:1});o.userData.ownedMaterial=true;o.userData.sharedGeometry=true;}});
  return {obj:g,height:size.y*scale};
}
export async function createScenery(world, id) {
  const root=new THREE.Group(); root.name='authored-route';
  const rand=mulberry32({ocean:1920,jungle:8402,space:781}[id]);
  const rock=await rockPrototype();
  const chunks=[]; const floor=id==='jungle'?world.groundY:world.floorY;
  const coralColors=[0xeab38d,0xe08378,0xbfd6a1,0x609e87,0xc5a4bb,0xe5c796];
  const add=(chunk,file,x,z,len,tint)=>{
    const c=spawnCreature(id,file,{len,variant:Math.floor(rand()*8)}); if(!c)return;
    c.obj.position.set(x,floor+c.dims.y/2,z); c.obj.rotation.y=rand()*Math.PI*2;
    c.obj.traverse(o=>{if(o.isMesh){o.userData.sharedGeometry=true;o.material=o.material.clone();o.userData.ownedMaterial=true;
      o.material.roughness=.95;o.material.metalness=0;if(tint)o.material.color.lerp(new THREE.Color(tint),.55);
      o.material.emissive?.copy(o.material.color).multiplyScalar(.12);o.frustumCulled=!o.isSkinnedMesh;
    }});
    chunk.add(c.obj);
  };
  for(let section=0;section<6;section++) {
    const chunk=new THREE.Group();chunk.position.z=20-section*76; chunks.push(chunk);root.add(chunk);
    for(const side of [-1,1]) {
      if(id==='ocean') {
        for(let i=0;i<9;i++) {
          const depth=i%3;
          add(chunk,`coral${i%3+1}.glb`,side*(17+depth*7+rand()*5),-i*8-rand()*5,4+depth*2+rand()*4,coralColors[(section+i)%coralColors.length]);
        }
        if(section%2) for(let i=0;i<3;i++)add(chunk,'kelp.glb',side*(23+i*6),-22-i*12,18+i*4,0x75a779);
      } else if(id==='jungle') {
        for(let i=0;i<5;i++)add(chunk,`tree${i%4+1}.glb`,side*(20+(i%2)*13+rand()*5),-i*15,18+rand()*11,0x9fb569);
        add(chunk,'log.glb',side*18,-37,7,0x976c44);
        add(chunk,'stump.glb',side*17,-65,3.8,0x8c754e);
      }
      if(id==='space' || section%2===0) {
        const c=rockAt(rock,id==='space'?18+rand()*16:11+rand()*8,id==='space'?0xa7a5bd:0xd5c3a0);
        c.obj.position.set(side*(id==='space'?34:31),id==='space'?side*9:floor+c.height/2,-42);
        if(id==='space')c.obj.rotation.z=side*.7;
        chunk.add(c.obj);
      }
    }
  }
  // A sourced creature follows a slow crossing path at the destination.
  let whale=null;
  if(id==='ocean') {
    const c=spawnCreature(id,'scenic_whale.glb',{len:34,yaw:Math.PI/2});
    if(c){whale=c;root.add(c.obj);c.obj.position.set(28,17,-150);}
  }
  // Current / orbital / vine gate: a light effect, not a collision asset.
  const portal=new THREE.Group();const color=id==='space'?0xefdab0:id==='ocean'?0xc0eace:0xe2d3a0;
  for(let i=0;i<3;i++) {
    const arc=new THREE.Mesh(new THREE.TorusGeometry(19+i*.9,.08,5,96,Math.PI*1.7),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.45-i*.1,depthWrite:false}));
    arc.rotation.z=i*.7; portal.add(arc);
  }
  portal.position.set(0,id==='jungle'?5:3,-175);root.add(portal);portal.name='destination-light';
  let waterfall=null,waterMaterial=null;
  if(id==='jungle') {
    // Water is an effect; the cliff silhouette is assembled from sourced rock.
    waterfall=new THREE.Group();waterfall.position.set(30,floor,-190);root.add(waterfall);
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const cliff=rockAt(rock,15+i*2,0x9caa86);cliff.obj.position.set(side*(9-i),7+i*7,-i*2);waterfall.add(cliff.obj);
    }
    waterMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 vUv;uniform float time;void main(){float edge=smoothstep(0.,.12,vUv.x)*smoothstep(1.,.88,vUv.x);float streak=.7+.12*sin(vUv.x*80.+sin(vUv.y*10.+time)*.4)+.12*sin(vUv.y*55.+time*3.);gl_FragColor=vec4(mix(vec3(.46,.73,.68),vec3(.86,.95,.81),streak),edge*.72);}' });
    const fall=new THREE.Mesh(new THREE.PlaneGeometry(12,27,1,1),waterMaterial);fall.position.set(0,15,3);waterfall.add(fall);
    const streamGeo=new THREE.PlaneGeometry(7,630,1,64);const pos=streamGeo.attributes.position;
    for(let i=0;i<pos.count;i++)pos.setX(i,pos.getX(i)+Math.sin(pos.getY(i)*.025)*2);
    const stream=new THREE.Mesh(streamGeo,waterMaterial);stream.rotation.x=-Math.PI/2;stream.position.set(18,floor+.07,-235);root.add(stream);
    for(let i=0;i<7;i++){const ripple=new THREE.Mesh(new THREE.RingGeometry(1,1.04,48),new THREE.MeshBasicMaterial({color:0xe6f2dc,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));ripple.rotation.x=-Math.PI/2;ripple.position.set(30,floor+.09,-175+i*2);ripple.scale.setScalar(3+i*.7);root.add(ripple);}
  }
  world.scene.add(root);
  return {
    root,
    update(dt,speed) {
      if(waterMaterial)waterMaterial.uniforms.time.value+=dt;
      if(waterfall)waterfall.position.z=-190+Math.max(0,(world.journeyProgress||0)-.7)*310;
      for(const chunk of chunks){chunk.position.z+=speed*dt;if(chunk.position.z>100)chunk.position.z-=456;}
      portal.position.z=-175+Math.max(0,(world.journeyProgress||0)-.82)*610;
      portal.visible=id!=='jungle'||(world.journeyProgress||0)>.7;
      if(whale){whale.mixer?.update(dt);const finale=(world.journeyProgress||0)>.8;whale.obj.position.x+=dt*(finale?-3.5:-.2);whale.obj.position.z=finale?-90:-170; if(whale.obj.position.x< -40)whale.obj.position.x=40;}
    },
    dispose() {
      world.scene.remove(root);
      root.traverse(o=>{if(o.isMesh){if(!o.userData.sharedGeometry&&!o.userData.sharedAsset)o.geometry?.dispose();if(o.userData.ownedMaterial||(!o.userData.sharedGeometry&&!o.userData.sharedAsset))o.material.dispose();}});
    },
  };
}
