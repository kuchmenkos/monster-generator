import type {Genome} from './genome';
import type {SkinBuffers} from './skin-mesh';
/** One cancellable job per client. Obsolete workers cannot publish stale geometry. */
export class SkinClient{
 private worker?:Worker; private reject?: (e:Error)=>void; private serial=0;
 build(genome:Genome):Promise<SkinBuffers>{
  this.cancel();const id=++this.serial;
  return new Promise((resolve,reject)=>{
   this.reject=reject;const worker=new Worker(new URL('./skin.worker.ts',import.meta.url),{type:'module'});this.worker=worker;
   worker.onmessage=(event:MessageEvent<{id:number;mesh:SkinBuffers;error?:string}>)=>{if(event.data.id!==id||id!==this.serial)return;this.reject=undefined;worker.terminate();this.worker=undefined;if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.mesh);};
   worker.onerror=(event)=>{if(id!==this.serial)return;this.reject=undefined;worker.terminate();this.worker=undefined;reject(new Error(event.message||'Не удалось построить поверхность'));};
   worker.postMessage({id,genome});
  });
 }
 cancel(){this.serial++;this.worker?.terminate();this.worker=undefined;this.reject?.(new DOMException('Superseded','AbortError'));this.reject=undefined;}
}
