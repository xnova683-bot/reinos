const fs=require('fs'),jpeg=require('jpeg-js');
const src=jpeg.decode(fs.readFileSync('assets/map-card-horde.jpg'),{useTArray:true});
const tw=1032,th=1170;
const out=jpeg.encode({data:Buffer.alloc(tw*th*4),width:tw,height:th},85).data;
const ox=new Uint8Array(out);
for(let y=0;y<th;y++){
  const sy=Math.floor(y*src.height/th);
  for(let x=0;x<tw;x++){
    const sx=Math.floor(x*src.width/tw);
    const si=(sy*src.width+sx)*4,di=(y*tw+x)*4;
    ox[di]=src.data[si];ox[di+1]=src.data[si+1];ox[di+2]=src.data[si+2];ox[di+3]=255;
  }
}
fs.writeFileSync('assets/map-card-horde.jpg',jpeg.encode({data:ox,width:tw,height:th},85).data);
console.log('ok',tw,th);
