// Nominal design studies, not dimensions measured from a manufactured pack.
// Millimetres describe our proposed master. Source meshes retain their shape.
const nominal = {
  'juice-carton':[100,238,72], 'milk-carton':[100,238,72],
  'shoe-box':[350,135,240], 'appliance-box':[280,280,230],
  'chips-bag':[225,320,75], 'crackers-pack':[175,265,65],
  'dragee-tube':[90,162,90], 'candy-pack':[280,210,70],
  'food-tin':[77,75,77], 'flip-top-pack':[56,103,30],
  'paper-sack':[463,700,180], 'wooden-crate':[240,64,106],
};
export const printFaces=['right','left','top','bottom','front','back','wrap'];
export function printSpec(project){
  if(project.id==='textile-pillow')return null;
  const [w,h,d]=nominal[project.id];
  const kind=project.model==='pouch'?'film':project.model==='tube'||project.source?.mapping==='cylinder'?'label':project.id==='wooden-crate'?'surface':project.id==='paper-sack'?'sack':project.id==='flip-top-pack'?'flip':project.model==='shoebox'?'tray':project.model==='carton'?'carton':'box';
  const bodyH=kind==='carton'?h*.76:kind==='tray'?h-22:project.id==='food-tin'?h*.84:project.model==='tube'?h*(1-.08/project.dimensions[1]):h;
  return {version:1,kind,w,h,d,bodyH,bleed:3,safe:5,seam:kind==='film'?10:kind==='label'?5:12,
    status:'concept-not-production-approved',units:'mm',sizeOrigin:'proposed-not-measured',
    colorSpace:'sRGB',font:'Rubik SemiBold 650 · outlined',
    dimensions:kind==='label'?`Ø ${w} × ${h} mm`:`${w} × ${h} × ${d} mm`};
}
export function printFaceSize(project,face){
  const s=printSpec(project);
  if(!s)return [120,120];
  if(face==='wrap')return [Math.PI*s.w,s.bodyH];
  if(face==='top'||face==='bottom')return face==='top'&&s.kind==='tray'?[s.w+10,s.d+10]:[s.w,s.d];
  if(face==='left'||face==='right')return [s.d,s.bodyH];
  return [s.w,s.bodyH];
}
// UV contract for imported sources. Front/back are read from outside, so the
// back reverses X, not the lettering. Do not overwrite TEXCOORD_0/PBR UVs.
export function printUV(face,p,bounds,span,artHeight=1){
  const x=(p.x-bounds.min.x)/span.x,y=(p.y-bounds.min.y)/span.y/artHeight,z=(p.z-bounds.min.z)/span.z;
  if(face===6)return [.25+Math.atan2(p.x,p.z)/(Math.PI*2),y];
  return face===0?[1-z,y]:face===1?[z,y]:face===2?[x,1-z]:face===3?[x,z]:face===5?[1-x,y]:[x,y];
}
