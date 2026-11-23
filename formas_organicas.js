import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { realismStats } from './realismo.js';
const FT=.3048;

function components(geo){
 const p=geo.attributes.position,idx=geo.index.array,parents=Array.from({length:p.count},(_,i)=>i),same=new Map();
 const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parents[b]=a;};
 for(let i=0;i<p.count;i++){const k=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(',');if(same.has(k))join(i,same.get(k));else same.set(k,i);}
 for(let t=0;t<idx.length;t+=3){join(idx[t],idx[t+1]);join(idx[t],idx[t+2]);}
 const groups=new Map();for(let t=0;t<idx.length;t+=3){const k=root(idx[t]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(idx[t],idx[t+1],idx[t+2]);}
 return [...groups.values()].map(indices=>{const data=[];for(const i of indices)data.push(p.getX(i),p.getY(i),p.getZ(i));const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data,3));g.computeVertexNormals();return g;}).flatMap(g=>{
  const p=g.attributes.position;if(p.count<=36||p.count%36!==0)return [g];
  const chunks=[];for(let i=0;i<p.count;i+=36){const c=new THREE.BufferGeometry();c.setAttribute('position',new THREE.Float32BufferAttribute(p.array.slice(i*3,(i+36)*3),3));c.computeVertexNormals();chunks.push(c);}
  if(chunks.every(c=>orientedBox(c))){g.dispose();return chunks;}chunks.forEach(c=>c.dispose());return [g];
 });
}
function orientedBox(g){
 const p=g.attributes.position;if(p.count!==36)return null;
 const axes=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);const n=b.sub(a).cross(c.sub(a)).normalize();if(!axes.some(v=>Math.abs(v.dot(n))>.999))axes.push(n.clone());}
 if(axes.length!==3||Math.abs(axes[0].dot(axes[1]))>.001)return null;
 axes[2].crossVectors(axes[0],axes[1]).normalize();
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<p.count;i++){a.fromBufferAttribute(p,i);axes.forEach((axis,k)=>{const v=axis.dot(a);lo[k]=Math.min(lo[k],v);hi[k]=Math.max(hi[k],v);});}
 for(let i=0;i<p.count;i++){a.fromBufferAttribute(p,i);for(let k=0;k<3;k++){const v=axes[k].dot(a);if(Math.min(Math.abs(v-lo[k]),Math.abs(v-hi[k]))>.001)return null;}}
 const size=hi.map((v,k)=>v-lo[k]);if(Math.min(...size)<.01)return null;
 const center=new THREE.Vector3();axes.forEach((a,k)=>center.addScaledVector(a,(lo[k]+hi[k])/2));return {axes,size,center};
}
function padded(b,pillow){
 const [x,y,z]=b.size;let g;
 if(pillow){
  g=new THREE.SphereGeometry(1,28,18);const p=g.attributes.position;
  for(let i=0;i<p.count;i++)for(let k=0;k<3;k++){const v=p.array[i*3+k];p.array[i*3+k]=Math.sign(v)*Math.pow(Math.abs(v),.48)*b.size[k]/2;}
 }else g=new RoundedBoxGeometry(x,y,z,5,Math.min(.065/FT,Math.min(...b.size)*.44));
 g.applyMatrix4(new THREE.Matrix4().makeBasis(...b.axes));g.translate(...b.center.toArray());g.computeVertexNormals();return g.index?g.toNonIndexed():g;
}
function foliage(g,seed){
 g.computeBoundingBox();const box=g.boundingBox,s=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());
 if(Math.min(s.x,s.y,s.z)*FT<.08)return null;
 let state=Number(seed)||71;const rand=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
 const data=[],width=Math.min(s.x,s.y,s.z)*.14,count=Math.min(1000,Math.max(180,Math.round(s.x*s.y*s.z*8)));
 const outline=[[-.5,0,0],[-.28,.23,.05],[0,.31,.09],[.32,.2,.05],[.5,0,0],[.25,-.21,.05],[0,-.29,.09],[-.3,-.2,.05]];
 const q=new THREE.Quaternion(),axis=new THREE.Vector3(),center=new THREE.Vector3(),v=new THREE.Vector3();
 for(let i=0;i<count;i++){
  const u=rand()*2-1,phi=rand()*Math.PI*2,r=Math.cbrt(rand())*.88,t=Math.sqrt(1-u*u);
  center.set(c.x+r*t*Math.cos(phi)*s.x/2,c.y+r*t*Math.sin(phi)*s.y/2,c.z+r*u*s.z/2);
  axis.set(rand()-.5,rand()-.5,rand()-.5).normalize();q.setFromAxisAngle(axis,rand()*Math.PI*2);const scale=width*(.7+rand()*.6);
  for(let j=0;j<8;j++)for(const point of [[0,0,.1],outline[j],outline[(j+1)%8]]){v.fromArray(point).multiplyScalar(scale).applyQuaternion(q).add(center);data.push(v.x,v.y,v.z);}
 }
 const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(data,3));result.computeVertexNormals();realismStats.foliageClusters=(realismStats.foliageClusters||0)+1;return result;
}

export function softenFurniture(geo,e,mat){
 if(!e.familia?.startsWith('CV3')||mat.userData.ghost)return geo;
 const n=e.familia+' '+mat.name,kind=mat.userData.finishClass||'';
 if(kind==='leaf'&&geo.index.count<12000){const leaves=foliage(geo,e.id);if(leaves){geo.dispose();mat.normalMap=null;mat.bumpMap=null;mat.roughness=.9;return leaves;}}
 if(/Vidrio|Cristal|Espejo|Grifo|Cromo|Lampara|Luminaria|Fregadero|Inodoro|Ducha/i.test(n))return geo;
 const parts=components(geo);let modified=0;
 const result=parts.map(g=>{
  const b=orientedBox(g);if(!b)return g;
  const textile=(kind==='fabric'||/Tela|Tapiz|Cojin|Almohada|Edredon|Colchon|Sofa|Sillon/i.test(n))&&!/Madera|Pata|Estructura|Marco|Metal/i.test(mat.name);
  let out;if(textile){out=padded(b,/Cojin|Almohada/i.test(n));realismStats.paddedParts=(realismStats.paddedParts||0)+1;}
  else{const r=Math.min(.008/FT,Math.min(...b.size)*.22);out=new RoundedBoxGeometry(...b.size,3,r);out.applyMatrix4(new THREE.Matrix4().makeBasis(...b.axes));out.translate(...b.center.toArray());if(out.index)out=out.toNonIndexed();}
  g.dispose();modified++;return out;
 });
 if(!modified){parts.forEach(g=>g.dispose());return geo;}
 result.forEach(g=>g.deleteAttribute('uv'));const merged=mergeGeometries(result,false);result.forEach(g=>g.dispose());if(!merged)return geo;
 geo.dispose();realismStats.roundedParts+=modified;return merged;
}

