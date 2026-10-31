/** A catalog can grow without starting every owned model's fetch/decode at once.
 * Jobs begin synchronously when there is room, preserve FIFO ordering otherwise,
 * and release their slot after either success or failure. Ownership/retries stay
 * with the asset library; this queue never retries or discards a requested job. */
export class AnimalModelLoadBudget{
 private active=0;
 private waiting:(()=>void)[]=[];
 run<T>(load:()=>Promise<T>):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
   const start=()=>{
    this.active++;
    const finished=()=>{this.active--;this.waiting.shift()?.();};
    try{Promise.resolve(load()).then(value=>{finished();resolve(value);},error=>{finished();reject(error);});}
    catch(error){finished();reject(error);}
   };
   if(this.active<2)start();else this.waiting.push(start);
  });
 }
}
