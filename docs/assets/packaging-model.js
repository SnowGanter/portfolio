export const faces = ['right', 'left', 'top', 'bottom', 'front', 'back', 'wrap'];
export function makePackagingModel(T, project, materials) {
  const group=new T.Group();
  const [w,h,d]=project.dimensions;
  const plain=(color,roughness=.75)=>new T.MeshPhysicalMaterial({color,roughness,metalness:0});
  const add=(geometry,material,x=0,y=0,z=0)=>{
    const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  if(project.model==='pouch') {
    // Two joined inflated sheets, not a sphere or a flat image plane.
    for(const side of [1,-1]) {
      const positions=[],uvs=[],indices=[],nx=72,ny=88;
      for(let j=0;j<=ny;j++) for(let i=0;i<=nx;i++) {
        const u=i/nx,v=j/ny;
        const sx=2*u-1,edge=Math.pow(Math.abs(sx),5),end=Math.exp(-Math.min(v,1-v)*14);
        const standing=project.id==='candy-pack',gusset=project.id==='crackers-pack';
        const edgeWidth=(standing?.88+.12*v:.96+.035*Math.sin(Math.PI*v));
        const wrinkle=.012*Math.sin(u*65+v*24)*(edge+end)+.018*Math.sin((u+side*v*.62)*72)*end+.008*Math.sin(v*39+u*14)*edge;
        const inflated=Math.pow(Math.sin(Math.PI*u),.34)*Math.pow(Math.sin(Math.PI*v),standing?.3:.4)*d*.5;
        const fold=gusset?.035*Math.exp(-Math.pow((Math.abs(sx)-.83)/.10,2)):0;
        const seam=Math.min(v,1-v)<.045;
        const z=seam?.007+.003*Math.sin(u*380):inflated+wrinkle-fold;
        positions.push((u-.5)*w*edgeWidth,(v-.5)*h+.004*Math.sin(u*27)*end,side*z);
        uvs.push(side===1?u:1-u,v);
      }
      for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) {
        const a=j*(nx+1)+i,b=a+1,c=a+nx+1,e=c+1;
        indices.push(...(side===1?[a,b,e,a,e,c]:[a,e,b,a,c,e]));
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
      add(geo,materials[side===1?4:5]);
    }
    // Heat-welded crimping is built into the film, not a row of grey cubes.
    const fin=add(new T.RoundedBoxGeometry(w*.035,h*.89,.025,2,.008),materials[5],0,0,-d*.48);fin.name='rear-fin-seal';
    if(project.id==='candy-pack')for(const side of [-1,1])add(new T.RoundedBoxGeometry(w*.86,.018,.023,2,.007),materials[side>0?4:5],0,h*.35,side*d*.28);
  } else if(project.model==='tube') {
    const tube=new T.CylinderGeometry(w*.5,w*.5,h-.08,128,6,false),uv=tube.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)+.25);
    add(tube,[materials[6],materials[2],materials[3]]);
    const rim=new T.MeshPhysicalMaterial({color:'#c5c4bb',metalness:.83,roughness:.3});
    for(const dir of [-1,1])add(new T.LatheGeometry([[w*.48,-.025],[w*.51,-.015],[w*.52,0],[w*.51,.025],[w*.48,.028]].map(p=>new T.Vector2(...p)),128),rim,0,dir*h*.5,0);
    add(new T.CylinderGeometry(w*.48,w*.48,.022,128),materials[2],0,h*.5+.01);
  } else if(project.model==='shoebox') {
    const stock=plain('#cdbb9e'),bodyH=h-.22,t=.035;
    const rounded=(a,b,c)=>new T.RoundedBoxGeometry(a,b,c,3,Math.min(.015,a/5,b/5,c/5));
    add(rounded(w,t,d),materials[3],0,-h*.5,0);
    for(const side of [-1,1]){const walls=[stock,stock,stock,stock,stock,stock];walls[side>0?0:1]=materials[side>0?0:1];add(rounded(t,bodyH,d),walls,side*w*.5,-.11,0);}
    add(rounded(w,bodyH,t),[stock,stock,stock,stock,stock,materials[5]],0,-.11,-d*.5);
    const shape=new T.Shape(),top=bodyH*.5;
    shape.moveTo(-w*.5,-top);shape.lineTo(w*.5,-top);shape.lineTo(w*.5,top);shape.lineTo(.16,top);shape.absarc(0,top,.16,0,-Math.PI,true);shape.lineTo(-w*.5,top);shape.closePath();
    const geo=new T.ExtrudeGeometry(shape,{depth:t,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:2,curveSegments:32});
    const p=geo.attributes.position,uv=geo.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+w*.5)/w,(p.getY(i)+top)/bodyH);
    add(geo,[materials[4],stock],0,-.11,d*.5-t*.5);
    add(rounded(w-.06,bodyH,.006),stock,0,-.11,-d*.5+.024);
    const lid=add(rounded(w+.1,.055,d+.1),[stock,stock,materials[2],stock,stock,stock],0,h*.5+.04,0);lid.name='separate-lid';
    const edgeGeo=(a,b,c)=>{const g=rounded(a,b,c),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,uv.getY(i)*.045);return g;};
    for(const side of [-1,1]){
      add(edgeGeo(w+.1,.18,t),[stock,stock,stock,stock,materials[2],materials[2]],0,h*.5-.073,side*(d*.5+.033));
      add(edgeGeo(t,.18,d+.06),[materials[2],materials[2],stock,stock,stock,stock],side*(w*.5+.033),h*.5-.073,0);
    }
  } else {
    add(new T.RoundedBoxGeometry(w,h,d,3,.02),materials);
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
      const tape=new T.MeshPhysicalMaterial({color:'#be9859',roughness:.47,transparent:true,opacity:.45,depthWrite:false});
      for(const side of [-1,1]){
        const flap=add(new T.RoundedBoxGeometry(w*.985,.012,d*.49,2,.004),materials[2],0,h*.5+.008,side*d*.25);
        const pos=flap.geometry.attributes.position,uv=flap.geometry.attributes.uv;
        for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)+w*.5)/w,1-(pos.getZ(i)+side*d*.25+d*.5)/d);
      }
      add(new T.BoxGeometry(w*.99,.014,.006),plain('#736d62'),0,h*.5+.01,0);
      add(new T.BoxGeometry(w*.999,.004,.23),tape,0,h*.5+.018,0);
      for(const side of [-1,1])add(new T.BoxGeometry(.005,.32,.23),tape,side*(w*.5+.008),h*.5-.14,0);
    }
  }
  return group;
}
export function framePackaging(dimensions, aspect) {
  // Stable bounding sphere fits every rotation on portrait and landscape screens.
  const [w,h,d]=dimensions;
  const fit=Math.max(h*.5+.12,(Math.hypot(w,d)*.5+.1)/Math.max(.3,aspect));
  return fit*1.28/Math.tan(16*Math.PI/180);
}
