export const faces = ['right', 'left', 'top', 'bottom', 'front', 'back', 'wrap'];
export function makePackagingModel(T, project, materials) {
  const group=new T.Group();
  const [w,h,d]=project.dimensions;
  const plain=(color,roughness=.75)=>new T.MeshStandardMaterial({color,roughness,metalness:.03});
  const add=(geometry,material,x=0,y=0,z=0)=>{
    const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);group.add(mesh);return mesh;
  };
  if(project.model==='pouch') {
    // Two joined inflated sheets, not a sphere or a flat image plane.
    for(const side of [1,-1]) {
      const positions=[],uvs=[],indices=[],nx=32,ny=36;
      for(let j=0;j<=ny;j++) for(let i=0;i<=nx;i++) {
        const u=i/nx,v=j/ny;
        const edgeWidth=.91+.09*Math.sin(Math.PI*v);
        const wrinkle=.025*Math.sin(u*50)*Math.pow(Math.abs(v-.5)*2,9);
        positions.push((u-.5)*w*edgeWidth,(v-.5)*h,side*(Math.sin(Math.PI*u)*Math.sin(Math.PI*v)*d*.5+wrinkle));
        uvs.push(side===1?u:1-u,v);
      }
      for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) {
        const a=j*(nx+1)+i,b=a+1,c=a+nx+1,e=c+1;
        indices.push(...(side===1?[a,b,e,a,e,c]:[a,e,b,a,c,e]));
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
      add(geo,materials[side===1?4:5]);
    }
    for(const dir of [-1,1]) {
      add(new T.BoxGeometry(w*.91,.10,.025),materials[dir===1?2:3],0,dir*(h*.5-.025),0);
      const seam=plain('#d5d1ca');
      for(let i=0;i<24;i++) add(new T.BoxGeometry(.012,.06,.027),seam,-w*.43+i*w*.86/23,dir*(h*.5-.025),0);
    }
  } else if(project.model==='tube') {
    add(new T.CylinderGeometry(w*.5,w*.5,h,64,1,false),[materials[6],materials[2],materials[3]]);
    add(new T.CylinderGeometry(w*.51,w*.51,.13,64),plain('#d8d5ce',.4),0,h*.5+.025);
    add(new T.CylinderGeometry(w*.51,w*.51,.045,64),plain('#d8d5ce',.4),0,-h*.5);
  } else if(project.model==='shoebox') {
    add(new T.BoxGeometry(w,h,d),materials,0,-.07,0);
    add(new T.BoxGeometry(w+.075,.2,d+.075),materials,0,h*.5+.01,0);
    add(new T.BoxGeometry(w+.08,.012,d+.08),plain('#3b3832'),0,h*.5-.096,0);
    add(new T.CircleGeometry(.095,32),plain('#353431'),0,-.12,d*.5+.003);
  } else {
    add(new T.BoxGeometry(w,h,d),materials);
    if(project.model==='carton') {
      const shape=new T.Shape();shape.moveTo(-w*.5,0);shape.lineTo(0,.48);shape.lineTo(w*.5,0);shape.closePath();
      const geo=new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false});
      // Extruded roof gets proper planar UVs; front and slopes retain artwork.
      const position=geo.attributes.position,uv=geo.attributes.uv;
      for(let i=0;i<position.count;i++) uv.setXY(i,(position.getX(i)+w*.5)/w,position.getY(i)/.48);
      add(geo,[materials[2],materials[2]],0,h*.5,-d*.5);
      add(new T.BoxGeometry(.045,.13,d),plain('#eeeae0'),0,h*.5+.53,0);
      const cap=add(new T.CylinderGeometry(.17,.17,.10,40),plain('#f4f1e8',.35),w*.23,h*.5+.24,d*.18);
      cap.rotation.z=-Math.atan(.48/(w*.5));
    } else {
      add(new T.BoxGeometry(w,.013,.23),plain('#c8ba9c'),0,h*.5+.009,0);
      add(new T.BoxGeometry(.012,.23,.24),plain('#c8ba9c'),w*.5+.007,h*.5-.105,0);
    }
  }
  return group;
}
export function framePackaging(dimensions, aspect) {
  // Stable bounding sphere fits every rotation on portrait and landscape screens.
  const [w,h,d]=dimensions;
  const radius=Math.hypot(w,h+.65,d)*.5;
  return radius*3.8/Math.min(1,Math.max(.3,aspect));
}
