import * as T from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { morphology, type Morphology } from './morphology';
import { NOSE_NONE, type Genome } from './genome';
export type SkinBuffers={position:Float32Array;normal:Float32Array;index:Uint32Array; cavity:Float32Array; step:number};
const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const links=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const smin=(a:number,b:number,k:number)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;};
export function skinField(m:Morphology,x:number,y:number,z:number){
 const origin=m.front(0,m.nasal.cy),local=z-origin;
 const head=z-m.front(x,y),nose=m.nasal.solid(x,y,local);
 const united=smin(head,nose,.045);
 return -smin(-united,m.nasal.cavities(x,y,local),.004);
}
function boundary(index:number[]){
 const edges=new Map<string,{a:number;b:number;n:number}>();
 for(let i=0;i<index.length;i+=3)for(let j=0;j<3;j++){const a=index[i+j],b=index[i+(j+1)%3],key=a<b?`${a}/${b}`:`${b}/${a}`;const e=edges.get(key);if(e)e.n++;else edges.set(key,{a,b,n:1});}
 return [...edges.values()].filter(e=>e.n===1);
}
/** True volumetric patch; each lattice edge owns exactly one output vertex. */
const cache=new Map<string,SkinBuffers>();
const copy=(m:SkinBuffers):SkinBuffers=>({position:m.position.slice(),normal:m.normal.slice(),index:m.index.slice(),cavity:m.cavity.slice(),step:m.step});
export function buildSkinBuffers(g:Genome):SkinBuffers{
 const key=JSON.stringify([g.seed,g.chaos,...(['shape','eyes','nose','mouth','chin','brows','eyeCut','booty'] as const).map(k=>g.genes[k])]);
 const cached=cache.get(key);if(cached)return copy(cached);
 const result=extractSkin(g);if(cache.size>=8)cache.delete(cache.keys().next().value!);cache.set(key,copy(result));return result;
}
function extractSkin(g:Genome):SkinBuffers{
 const m=morphology(g),n=m.nasal,hasNose=g.genes.nose!==NOSE_NONE;
 const source=new T.SphereGeometry(1,128,96);source.deleteAttribute('normal');source.deleteAttribute('uv');
 const welded=mergeVertices(source,1e-6);source.dispose();
 const p=welded.attributes.position, positions:number[]=[],normals:number[]=[],cavity:number[]=[],indices:number[]=[];
 for(let i=0;i<p.count;i++){const q=m.point(new T.Vector3().fromBufferAttribute(p,i));positions.push(q.x,q.y,q.z);}
 const cy=(n.boundY0+n.boundY1)*.5,w=n.boundX+.075,hy=(n.boundY1-n.boundY0)*.5+.075;
 const hx=w*1.5,hh=hy*1.5;
 const original=welded.index!;
 for(let i=0;i<original.count;i+=3){const a=original.getX(i),b=original.getX(i+1),c=original.getX(i+2),x=(positions[a*3]+positions[b*3]+positions[c*3])/3,y=(positions[a*3+1]+positions[b*3+1]+positions[c*3+1])/3,z=(positions[a*3+2]+positions[b*3+2]+positions[c*3+2])/3;
  if(hasNose&&z>0&&(x/hx)**2+((y-cy)/hh)**2<1)continue;indices.push(a,b,c);
 }
 welded.dispose();let step=0;
 if(hasNose){
  const outer=boundary(indices).filter(e=>positions[e.a*3+2]>0&&positions[e.b*3+2]>0);
  const feature=Math.min(...n.nostrils.map(h=>Math.min(h.sx,h.sy)*2));
  step=Number.isFinite(feature)?feature/12:.006;
  const nx=Math.ceil(w*2/step),ny=Math.ceil(hy*2/step),z0=Math.min(...[-w,w].flatMap(x=>[cy-hy,cy+hy].map(y=>m.front(x,y))))-m.front(0,n.cy)-.06,z1=n.boundZ+.09,nz=Math.ceil((z1-z0)/step);
  const dx=w*2/nx,dy=hy*2/ny,dz=(z1-z0)/nz,origin=m.front(0,n.cy),layer=(nx+1)*(ny+1);
  const values=new Float32Array(layer*(nz+1));
  // Cache the expensive base skin once per column.
  const base=new Float32Array(layer);
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)base[j*(nx+1)+i]=m.front(-w+i*dx,cy-hy+j*dy);
  for(let k=0;k<=nz;k++)for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
   const x=-w+i*dx,y=cy-hy+j*dy,z=z0+k*dz,head=origin+z-base[j*(nx+1)+i];
   const f=smin(head,n.solid(x,y,z),.045);
   values[k*layer+j*(nx+1)+i]=-smin(-f,n.cavities(x,y,z),.004);
  }
  const patch:number[]=[],vertices=new Map<string,number>();
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
   const baseId=k*layer+j*(nx+1)+i, stride=nx+1;
   const mask=(values[baseId]<0?1:0)|(values[baseId+1]<0?2:0)|(values[baseId+stride+1]<0?4:0)|(values[baseId+stride]<0?8:0)|(values[baseId+layer]<0?16:0)|(values[baseId+layer+1]<0?32:0)|(values[baseId+layer+stride+1]<0?64:0)|(values[baseId+layer+stride]<0?128:0);
   if(!edgeTable[mask])continue;
   const ids=[baseId,baseId+1,baseId+stride+1,baseId+stride,baseId+layer,baseId+layer+1,baseId+layer+stride+1,baseId+layer+stride],v=ids.map(id=>values[id]);
   const ev:number[]=[];
   links.forEach(([a,b],edge)=>{if(!(edgeTable[mask]&(1<<edge)))return;const key=ids[a]<ids[b]?`${ids[a]}/${ids[b]}`:`${ids[b]}/${ids[a]}`;let id=vertices.get(key);
    if(id===undefined){const t=v[a]/(v[a]-v[b]),ca=corners[a],cb=corners[b];id=positions.length/3;
     positions.push(-w+(i+ca[0]+(cb[0]-ca[0])*t)*dx,cy-hy+(j+ca[1]+(cb[1]-ca[1])*t)*dy,origin+z0+(k+ca[2]+(cb[2]-ca[2])*t)*dz);vertices.set(key,id);
    }ev[edge]=id;
   });
   for(let q=mask*16;triTable[q]!==-1;q+=3)patch.push(ev[triTable[q]],ev[triTable[q+2]],ev[triTable[q+1]]);
  }
  const inner=boundary(patch);
  const ring=(edges:ReturnType<typeof boundary>)=>[...new Set(edges.flatMap(e=>[e.a,e.b]))].sort((a,b)=>Math.atan2(positions[a*3+1]-cy,positions[a*3])-Math.atan2(positions[b*3+1]-cy,positions[b*3]));
  const a=ring(outer);let b=ring(inner);
  const initial=b;
  const outerAngles=a.map(id=>Math.atan2(positions[id*3+1]-cy,positions[id*3]));
  for(const t of [.25,.5,.75]){
   const next=initial.map(id=>{const x=positions[id*3],y=positions[id*3+1]-cy,angle=Math.atan2(y,x),rad=Math.hypot(x,y);let k=outerAngles.findIndex(v=>v>angle);if(k<0)k=0;const prev=(k+a.length-1)%a.length;
    let aa=outerAngles[prev],bb=outerAngles[k],at=angle;if(bb<aa)bb+=Math.PI*2;if(at<aa)at+=Math.PI*2;
    const r0=Math.hypot(positions[a[prev]*3],positions[a[prev]*3+1]-cy),r1=Math.hypot(positions[a[k]*3],positions[a[k]*3+1]-cy),rr=rad+(T.MathUtils.lerp(r0,r1,(at-aa)/(bb-aa))-rad)*t;
    const px=Math.cos(angle)*rr,py=cy+Math.sin(angle)*rr,vertex=positions.length/3;positions.push(px,py,m.front(px,py));return vertex;
   });
   for(let j=0;j<b.length;j++){const k=(j+1)%b.length;indices.push(next[j],next[k],b[j],next[k],b[k],b[j]);}b=next;
  }
  if(a.length<3||b.length<3)throw new Error('Nasal patch has no stitchable collar');
  // A monotonic angular zipper preserves both exact boundary loops.
  let ai=0,bi=0;
  const angle=(id:number)=>Math.atan2(positions[id*3+1]-cy,positions[id*3]);
  while(ai<a.length||bi<b.length){const na=ai<a.length?angle(a[(ai+1)%a.length])+(ai+1===a.length?Math.PI*2:0):Infinity,nb=bi<b.length?angle(b[(bi+1)%b.length])+(bi+1===b.length?Math.PI*2:0):Infinity;
   if(na<nb){indices.push(a[ai%a.length],a[(ai+1)%a.length],b[bi%b.length]);ai++;}
   else{indices.push(a[ai%a.length],b[(bi+1)%b.length],b[bi%b.length]);bi++;}
  }
  for(const i of patch)indices.push(i);
 }
 const normalGeometry=new T.BufferGeometry();normalGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));normalGeometry.setIndex(indices);normalGeometry.computeVertexNormals();const meshNormals=normalGeometry.attributes.normal;
 // Analytical normals include the cavity walls. The collar samples the same skin field.
 const e=Math.max(.0005,step*.25);
 for(let i=0;i<positions.length;i+=3){const [x,y,z]=positions.slice(i,i+3),inside=hasNose&&z>0&&Math.abs(x)<=w*1.01&&Math.abs(y-cy)<=hy*1.01;
  if(inside){const f=(a:number,b:number,c:number)=>skinField(m,a,b,c),v=new T.Vector3(f(x+e,y,z)-f(x-e,y,z),f(x,y+e,z)-f(x,y-e,z),f(x,y,z+e)-f(x,y,z-e)).normalize();normals.push(v.x,v.y,v.z);const local=z-m.front(0,n.cy);cavity.push(n.cavities(x,y,local)<.008&&local<n.boundZ*.88?1:0);}
  else{const v=new T.Vector3().fromBufferAttribute(meshNormals,i/3);
   if(z>0&&Math.abs(x)<hx*1.1&&Math.abs(y-cy)<hh*1.1){const analytic=new T.Vector3(-(m.front(x+e,y)-m.front(x-e,y))/(2*e),-(m.front(x,y+e)-m.front(x,y-e))/(2*e),1).normalize();const r=Math.sqrt((x/hx)**2+((y-cy)/hh)**2);v.lerp(analytic,1-T.MathUtils.smoothstep(r,.85,1.15)).normalize();}
   normals.push(v.x,v.y,v.z);cavity.push(0);}
 }
 normalGeometry.dispose();
 return {position:new Float32Array(positions),normal:new Float32Array(normals),index:new Uint32Array(indices),cavity:new Float32Array(cavity),step};
}
export function skinGeometry(data:SkinBuffers,g:Genome){const m=morphology(g),geo=new T.BufferGeometry(),colors:number[]=[],uv:number[]=[];
 for(let i=0;i<data.position.length;i+=3){const x=data.position[i],y=data.position[i+1],z=data.position[i+2],c=m.color(x,y,z);if(data.cavity[i/3])c.multiplyScalar(.46);colors.push(c.r,c.g,c.b);uv.push(x/(m.rx*2)+.5,y/(m.ry*2)+.5);}
 geo.setAttribute('position',new T.BufferAttribute(data.position,3));geo.setAttribute('normal',new T.BufferAttribute(data.normal,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setAttribute('restPosition',new T.BufferAttribute(data.position.slice(),3));geo.setIndex(new T.BufferAttribute(data.index,1));geo.userData.step=data.step;return geo;
}
