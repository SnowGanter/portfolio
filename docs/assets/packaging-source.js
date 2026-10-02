// CC0 Poly Haven geometry, not an approximation of the supplied Blender models.
// Source UVs remain untouched for normal/roughness maps. A second UV set carries
// new artwork, so replacing a label cannot erase folds, stitching or metal rims.
export async function loadPackagingSource(T,config,materials,decorate) {
  const loader=new T.GLTFLoader();
  let timer;
  const gltf=await Promise.race([loader.loadAsync(config.source.url),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Model timeout')),20000);})]).finally(()=>clearTimeout(timer));
  const assembly=new T.Group();
  const imported=gltf.scene;
  imported.updateMatrixWorld(true);
  const objects=[]; imported.traverse(n=>{if(n.isMesh&&(!config.source.nodes||config.source.nodes.includes(n.name)))objects.push(n);});
  if(!objects.length)throw new Error('Source model contains no selected mesh');
  for(const node of objects){
    imported.remove(node);assembly.add(node);
    // Assemblies retain local part positions; individual objects lose collection offsets.
    if(objects.length===1)node.position.set(0,0,0);
    node.castShadow=true;node.receiveShadow=true;
  }
  if(config.source.rotateX)assembly.rotation.x=config.source.rotateX;
  assembly.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(assembly,true),centre=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
  const scale=Math.max(...config.dimensions)/Math.max(size.x,size.y,size.z);
  const model=new T.Group();model.add(assembly);assembly.scale.multiplyScalar(scale);
  assembly.position.copy(centre).multiplyScalar(-scale);assembly.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(model,true),span=bounds.getSize(new T.Vector3());
  const blended=[];
  for(const node of objects){
    const stock=node.material;
    if(config.source.editNodes&&!config.source.editNodes.includes(node.name))continue;
    const geometry=node.geometry.toNonIndexed(),position=geometry.attributes.position;
    const designUV=new Float32Array(position.count*2),slot=new Int8Array(position.count/3);
    const faceType=config.source.mapping||'box';
    const v=[new T.Vector3(),new T.Vector3(),new T.Vector3()],normal=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3();
    for(let i=0;i<position.count;i+=3){
      for(let k=0;k<3;k++)v[k].fromBufferAttribute(position,i+k).applyMatrix4(node.matrixWorld);
      normal.crossVectors(ab.subVectors(v[1],v[0]),ac.subVectors(v[2],v[0])).normalize();
      const abs=[Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)];
      let f=abs[1]>Math.max(abs[0],abs[2])?(normal.y>0?2:3):abs[0]>abs[2]?(normal.x>0?0:1):(normal.z>0?4:5);
      // Metal endcaps and rolled rims stay in the original PBR material.
      if(faceType==='cylinder')f=abs[1]>.5?7:6;
      if(faceType==='wood'&&f!==4&&f!==5)f=7;
      // Soft folds must not split the print into arbitrary normal-based triangles.
      if(faceType==='textile')f=4;
      slot[i/3]=f;
      for(let k=0;k<3;k++){
        const p=v[k],x=(p.x-bounds.min.x)/span.x,y=(p.y-bounds.min.y)/span.y/(config.source.artHeight||1),z=(p.z-bounds.min.z)/span.z;
        let uv=f===0?[1-z,y]:f===1?[z,y]:f===2?[x,1-z]:f===3?[x,z]:f===5?[1-x,y]:[x,y];
        if(f===6)uv=[.25+Math.atan2(p.x,p.z)/(Math.PI*2),y];
        designUV[(i+k)*2]=uv[0];designUV[(i+k)*2+1]=uv[1];
      }
      if(f===6){const uu=[0,1,2].map(k=>designUV[(i+k)*2]);if(Math.max(...uu)-Math.min(...uu)>.5)for(let k=0;k<3;k++)if(uu[k]<.5)designUV[(i+k)*2]+=1;}
    }
    geometry.setAttribute('designUv',new T.Float32BufferAttribute(designUV,2));geometry.clearGroups();
    // Batch triangles by material: at most eight calls per imported part.
    const order=[];for(let f=0;f<8;f++){const start=order.length;for(let tri=0;tri<slot.length;tri++)if(slot[tri]===f)order.push(tri*3,tri*3+1,tri*3+2);if(order.length>start)geometry.addGroup(start,order.length-start,f);}geometry.setIndex(order);
    const painted=materials.map((base,face)=>{
      const m=stock.clone();m.side=T.FrontSide;m.normalScale.multiplyScalar(config.source.mapping==='wood'?.65:.7);
      m.userData.blend=base.userData.blend;m.userData.next=base.userData.next;
      m.userData.stock={value:stock.map};m.userData.original=base.userData.original;
      m.userData.nextOriginal=base.userData.nextOriginal;m.userData.artMap=base.userData.artMap;m.userData.face=face;
      if(faceType!=='cylinder'){m.metalness=0;m.metalnessMap=null;}
      decorate(m,true,faceType==='wood');blended.push(m);return m;
    });
    node.geometry=geometry;node.material=[...painted,stock];
  }
  model.userData.paintMaterials=blended;
  model.userData.source=config.source.id;
  model.userData.dimensions=[span.x,span.y,span.z];
  return model;
}
