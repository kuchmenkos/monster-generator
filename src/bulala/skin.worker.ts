import {buildSkinBuffers} from './skin-mesh';
import type {Genome} from './genome';
self.onmessage=(event:MessageEvent<{id:number;genome:Genome}>)=>{
 const {id,genome}=event.data;
 try{const mesh=buildSkinBuffers(genome);self.postMessage({id,mesh},{transfer:[mesh.position.buffer,mesh.normal.buffer,mesh.index.buffer,mesh.cavity.buffer]});}
 catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
