import {rng,type Genome} from './genome';
const smooth=(a:number,b:number,t:number)=>{const q=Math.max(0,Math.min(1,(t-a)/(b-a)));return q*q*(3-2*q);};
/** Seeded irregular islands in rest-skin space, independent of mesh tessellation. */
export function pigment(g:Genome){
 const r=rng(g.seed+'/pigment-v4');
 const spots=Array.from({length:64},()=>{const y=r()*2-1,a=r()*Math.PI*2,s=Math.sqrt(1-y*y);return {x:Math.cos(a)*s,y,z:Math.sin(a)*s,size:.09+r()*.17,phase:r()*6.28,gap:.35+r()*.65};});
 const phase=r()*6.28;
 return (x:number,y:number,z:number)=>{
  const kind=g.genes.pattern;
  if(kind===0)return 0;
  if(kind===2){const bend=Math.sin(y*3.1+phase)*.8+Math.sin(z*4.7+y*2.3)*.43;const wave=Math.sin(x*18+bend*3+Math.sin(y*7+phase)*.3);return smooth(.02+Math.sin(y*3+z)*.2,.4,wave);}
  let ink=0;
  for(const s of spots){const dx=x-s.x,dy=y-s.y,dz=z-s.z,d=Math.hypot(dx,dy,dz)/s.size;
   if(d>1.35)continue;
   const a=Math.atan2(dy,dx),edge=1+.12*Math.sin(a*3+s.phase)+.08*Math.sin(a*5-s.phase);
   let value=1-smooth(edge*.72,edge*1.15,d);
   if(kind===1)value*=smooth(.38,.61,d)*(smooth(s.gap,s.gap+.3,Math.abs(Math.atan2(Math.sin(a-s.phase),Math.cos(a-s.phase)))));
   ink=Math.max(ink,value);
  }
  if(kind===5)ink*=smooth(.1,.6,-z);
  if(kind===6)ink*=smooth(.2,.6,-z)*(1-smooth(-.45,-.1,y));
  if(kind===4)return 0;
  return ink;
 };
}
