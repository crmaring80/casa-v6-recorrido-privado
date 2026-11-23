import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const realismStats={normalMaps:0,roughnessMaps:0,roundedParts:0,windows:0,mirrors:0,hdri:false};
export async function daylightEnvironment(renderer,pmrem){
 try{
  const hdr=await new RGBELoader().loadAsync('./Iluminacion/cielo_parcialmente_nublado_1k.hdr');
  hdr.mapping=THREE.EquirectangularReflectionMapping;
  const rt=pmrem.fromEquirectangular(hdr);hdr.dispose();realismStats.hdri=true;return rt;
 }catch(e){console.warn('Se conserva el cielo procedural:',e);return null;}
}

export async function finishMaterial(material,entry,texture){
 const name=material.name;material.userData.finishClass=entry?.clase||"";
 if(entry){
  const info=url=>({url,escala_m:entry.escala_m,angulo:entry.angulo});
  const [normal,rough,color]=await Promise.all([texture(entry.normal?info(entry.normal):null,false),texture(entry.rugosidad?info(entry.rugosidad):null,false),texture(entry.color?info(entry.color):null,true)]);
  if(normal){material.normalMap=normal;material.normalScale.setScalar(/tela|fabric/.test(entry.clase)?.35:.2);material.bumpMap=null;realismStats.normalMaps++;}
  if(rough){material.roughnessMap=rough;material.roughness=.85;realismStats.roughnessMaps++;}
  if(color){material.map=color;material.color.setHex(0xffffff);material.userData.aparienciaRevit=true;}
 }
 material.envMapIntensity=.85;
 if(/(?:_Espejo|_33)$/i.test(name)){material.metalness=1;material.roughness=.035;material.color.setHex(0xdde2e3);material.envMapIntensity=.95;}
 else if(/Cromo|Grifo|Acero|Metal_cromado/i.test(name)){material.metalness=.96;material.roughness=.19;material.envMapIntensity=.9;}
 else if(/Encimera|Piedra|Marmol|Granito/i.test(name)){material.clearcoat=.32;material.clearcoatRoughness=.24;}
 else if(/Melamina|cocina_(Puertas|Cuerpo)|Frigorifico.*(Puerta|Cuerpo)/i.test(name)){material.clearcoat=.25;material.clearcoatRoughness=.3;material.roughness=.32;}
 if(/Tela|Tapiz|Cojin|Edredon|Almohada|Cortina|Toalla/i.test(name)){material.sheen=.45;material.sheenColor.copy(material.color);material.sheenRoughness=.85;}
 if(material.transparent&&/Vidrio|Cristal|Glass/i.test(name)){
  // vidrio claro: poco reflejo para que se vea a traves (antes opacity .2 y clearcoat 1 lo dejaban blanquecino)
  material.transmission=0;material.clearcoat=.3;material.clearcoatRoughness=.08;material.ior=1.5;material.thickness=0;material.opacity=.08;
  material.transparent=true;material.depthWrite=false;material.roughness=.05;material.color.setHex(0xeef5f6);material.envMapIntensity=.3;material.userData.ghost=true;
 }
 if(/Lampara.*_16$|Luminaria.*_16$/i.test(name)){material.emissive.setHex(0xffd9a3);material.emissiveIntensity=.2;}
 if(/CV5_Fachada_luz_calida/i.test(name)){material.emissive.setHex(0xffc978);material.emissiveIntensity=1.8;material.roughness=.28;}
 material.needsUpdate=true;return material;
}

// Only original, axis-aligned boxes: bounding dimensions and object placement are retained.
export function softenBox(geo,e,mat){
 if(!/Encimera|Mueble|Mesita|Comoda|Consola|Cojin|Almohada|Colchon|Edredon/i.test(e.familia||'')||mat.userData.ghost)return geo;
 const p=geo.attributes.position;if(p.count>36||geo.index.count!==36)return geo;
 geo.computeBoundingBox();const b=geo.boundingBox,size=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
 if(Math.min(size.x,size.y,size.z)<.015)return geo;
 for(let i=0;i<p.count;i++)for(let a=0;a<3;a++){
  const v=p.array[i*3+a],lo=b.min.getComponent(a),hi=b.max.getComponent(a);
  if(Math.min(Math.abs(v-lo),Math.abs(v-hi))>.0001)return geo;
 }
 const textile=/Cojin|Almohada|Colchon|Edredon/i.test(e.familia);
 const radius=Math.min((textile?.025:.003)/.3048,Math.min(size.x,size.y,size.z)*.16);
 const result=new RoundedBoxGeometry(size.x,size.y,size.z,textile?3:2,radius);result.translate(c.x,c.y,c.z);geo.dispose();realismStats.roundedParts++;return result;
}

export function windowLighting(scene,model,center){
 RectAreaLightUniformsLib.init();
 const windows=[];model.traverse(o=>{
  if(!o.isGroup||o.userData.categoria!=='Windows')return;
  const b=new THREE.Box3().setFromObject(o),size=b.getSize(new THREE.Vector3()),p=b.getCenter(new THREE.Vector3());
  if(size.y<.25)return;
  const normal=size.x>size.z?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0);
  if(normal.dot(center.clone().sub(p))<0)normal.negate();
  windows.push({p:p.addScaledVector(normal,.09),target:p.clone().add(normal),w:Math.max(size.x,size.z)*.85,h:size.y*.85});
 });
 realismStats.windows=windows.length;
 const lights=Array.from({length:Math.min(3,windows.length)},()=>{const l=new THREE.RectAreaLight(0xfff8ed,6,1,1);scene.add(l);return l;});
 const fixtures=[];model.traverse(o=>{if(o.isGroup&&(/Lampara_colgante|Luminaria_espejo/.test(o.userData.familia||'')||/CV5 (?:Aplique exterior|Baliza jardin)/i.test(o.name||''))){const b=new THREE.Box3().setFromObject(o),p=b.getCenter(new THREE.Vector3());if(!/CV5 /i.test(o.name||''))p.y=b.min.y-.04;fixtures.push(p);}});
 const bulbs=Array.from({length:Math.min(7,fixtures.length)},()=>{const l=new THREE.PointLight(0xffdcaa,6,4,2);scene.add(l);return l;});
 let previous='';
 return(camera,hour)=>{
  const near=[...windows].sort((a,b)=>a.p.distanceToSquared(camera.position)-b.p.distanceToSquared(camera.position)).slice(0,lights.length);
  const signature=near.map(x=>windows.indexOf(x)).join(',');
  near.forEach((w,i)=>{const l=lights[i];if(signature!==previous){l.position.copy(w.p);l.lookAt(w.target);l.width=w.w;l.height=w.h;}l.intensity=(hour<7||hour>17? .35:6);});previous=signature;
  const nearest=[...fixtures].sort((a,b)=>a.distanceToSquared(camera.position)-b.distanceToSquared(camera.position));
  bulbs.forEach((l,i)=>{if(nearest[i])l.position.copy(nearest[i]);l.intensity=hour<7.5||hour>16.5?14:3;});
 };
}

export function roomMirrors(scene,model){
 const mirrors=[];
 model.traverse(o=>{
  if(!o.isMesh||Array.isArray(o.material)||!/(?:_Espejo|_33)$/i.test(o.material.name)||o.material.metalness<.9)return;
  const b=new THREE.Box3().setFromObject(o),s=b.getSize(new THREE.Vector3()),p=b.getCenter(new THREE.Vector3());
  const alongX=s.x>s.z,w=Math.max(s.x,s.z);if(w<.2||s.y<.2||Math.min(s.x,s.z)>.12)return;
  const mirror=new Reflector(new THREE.PlaneGeometry(w*.98,s.y*.98),{clipBias:.003,textureWidth:512,textureHeight:512,color:0xc7cbce,multisample:0});
  const normal=alongX?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0);
  const reflect=mirror.onBeforeRender;mirror.onBeforeRender=function(renderer,scene,camera,...rest){if(scene.overrideMaterial)return;return reflect.call(this,renderer,scene,camera,...rest);};mirror.visible=false;scene.add(mirror);mirrors.push({mirror,p,normal,thickness:Math.min(s.x,s.z)/2+.002});
 });realismStats.mirrors=mirrors.length;
 return(camera,enabled)=>{
  let near=null,d=6*6;for(const m of mirrors){m.mirror.visible=false;const nd=m.p.distanceToSquared(camera.position);if(nd<d){d=nd;near=m;}}
  if(!enabled||!near)return;
  const n=near.normal.clone();if(n.dot(camera.position.clone().sub(near.p))<0)n.negate();
  near.mirror.position.copy(near.p).addScaledVector(n,near.thickness);near.mirror.lookAt(near.mirror.position.clone().add(n));near.mirror.visible=true;
 };
}


