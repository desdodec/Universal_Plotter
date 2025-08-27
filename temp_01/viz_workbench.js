(function(){
  "use strict";
  // ---------- Shortcuts ----------
  function $(s){ return document.querySelector(s); }
  function clamp(v,a,b){ return v<a? a : v>b? b : v; }
  function seededRand(i){ var t=(i*9301+49297)%233280; return (t/233280); }

  // ---------- App state ----------
  var P={ rows:[], series:false, datasetName:"(none)", source:"", schema:"x,y,(category?)" };

  // ---------- Color scales ----------
  function colorFor(val, scale, alpha){
    var a=(alpha==null)?1:alpha; var v=clamp(val,0,1);
    if (scale==="Plasma"){ return "rgba(" + Math.floor(255*v) + "," + Math.floor(120+100*v) + "," + Math.floor(200-150*v) + "," + a + ")"; }
    if (scale==="Turbo"){ return "rgba(" + Math.floor(255*v) + "," + Math.floor(255*Math.abs(0.5-v)*2) + "," + Math.floor(255*(1-v)) + "," + a + ")"; }
    if (scale==="Cividis"){ return "rgba(" + Math.floor(40+215*v) + "," + Math.floor(40+180*v) + "," + Math.floor(60+120*v) + "," + a + ")"; }
    if (scale==="Inferno"){ return "rgba(" + Math.floor(30+225*v) + "," + Math.floor(20+120*v) + "," + Math.floor(40+80*v) + "," + a + ")"; }
    if (scale==="Magma"){ return "rgba(" + Math.floor(50+205*v) + "," + Math.floor(30+100*v) + "," + Math.floor(60+160*v) + "," + a + ")"; }
    if (scale==="Bluered"){ return "rgba(" + Math.floor(255*(1-v)) + ",80," + Math.floor(255*v) + "," + a + ")"; }
    if (scale==="Rainbow"){ var t=v*6,i=Math.floor(t),f=t-i,r=(i===0||i===5)?1:(i===1?1-f:0),g=(i===1||i===2)?1:(i===0?f:(i===3?1-f:0)),b=(i===3||i===4)?1:(i===2?f:(i===5?1-f:0)); return "rgba(" + Math.floor(r*255) + "," + Math.floor(g*255) + "," + Math.floor(b*255) + "," + a + ")"; }
    var rr=68+187*v, gg=1+212*v, bb=84+131*v; return "rgba(" + Math.floor(rr) + "," + Math.floor(gg) + "," + Math.floor(bb) + "," + a + ")";
  }

  // ---------- Controls ----------
  function cfg(){ return {
    plotType: $("#plotType").value,
    opacity: parseFloat($("#opacity").value),
    pointSize: parseInt($("#pointSize").value,10),
    jitter: parseFloat($("#jitter").value),
    rotJitter: parseFloat($("#rotJitter").value),
    shape: $("#shape").value,
    colorscale: $("#colorscale").value,
    bg: $("#bg").value,
    blend: $("#blend").value,
    outline: $("#outline").checked,
    equal: $("#equal").checked,
    legend: $("#legend").checked,
    artIntensity: parseFloat($("#artIntensity").value),
    artDetail: parseInt($("#artDetail").value,10),
    bandwidth: parseInt($("#bandwidth").value,10),
    levels: parseInt($("#levels").value,10),
    gridN: parseInt($("#gridN").value,10),
    rdSteps: parseInt($("#rdSteps").value,10),
    rdFeed: parseFloat($("#rdFeed").value),
    rdKill: parseFloat($("#rdKill").value),
    dataStart: parseInt($("#dataStart").value,10),
    dataEnd: parseInt($("#dataEnd").value,10)
  }; }
  function updatePills(){ 
    $("#opv").textContent=$("#opacity").value; 
    $("#psv").textContent=$("#pointSize").value; 
    $("#jtv").textContent=$("#jitter").value;
    $("#dsv").textContent=$("#dataStart").value+"%";
    $("#dev").textContent=$("#dataEnd").value+"%";
  }

  // ---------- Data parsing ----------
  function parseCSV(text){
    var lines=text.trim().split(/\r?\n/);
    var head=lines[0].split(",").map(function(s){return s.trim();});
    var xi=head.findIndex(function(h){return h.toLowerCase()==="x";});
    var yi=head.findIndex(function(h){return h.toLowerCase()==="y";});
    var ci=head.findIndex(function(h){return h.toLowerCase()==="category";});
    var rows=[], series=true;
    for (var i=1;i<lines.length;i++){
      var cells=lines[i].split(",").map(function(s){return s.trim();});
      if (xi>=0 && yi>=0){
        var x=parseFloat(cells[xi]), y=parseFloat(cells[yi]); if (isFinite(x)&&isFinite(y)) rows.push({x:x,y:y,category:ci>=0?cells[ci]:null}); series=false;
      } else if (cells.length===1 || head.length===1){
        var v=parseFloat(cells[0]); if (isFinite(v)) rows.push({v:v});
      }
    }
    return {rows:rows, series:series};
  }
  function toPoincare(rows1D){
    var out=[]; for (var i=0;i<rows1D.length-1;i++){ var a=rows1D[i].v, b=rows1D[i+1].v; if (isFinite(a)&&isFinite(b)) out.push({x:a,y:b,category:null}); }
    return out;
  }
  function categories(rows){ var s={}; for (var i=0;i<rows.length;i++){ var c=rows[i].category; if (c!=null) s[String(c)]=1; } return Object.keys(s); }
  function updateInfo(){ var n=P.rows.length, cats=categories(P.rows); $("#datainfo").textContent = n? (String(n)+" points"+(cats.length?(" • "+cats.length+" categories"):"")) : ""; }

  // ---------- Canvases & sizing ----------
  var classic=$("#classic"), art=$("#art");
  var gClassic=classic.getContext("2d");
  var gArt=art.getContext("2d",{willReadFrequently:true});

  function cssSize(){ // always >= 2
    var rect=document.querySelector("main").getBoundingClientRect();
    var w=Math.max(2, Math.floor(rect.width)), h=Math.max(2, Math.floor(rect.height));
    return {w:w,h:h,dpr:(window.devicePixelRatio||1)};
  }
  function resizeBoth(){
    var s=cssSize();
    [classic, art].forEach(function(cv){
      var needW=(s.w*s.dpr)|0, needH=(s.h*s.dpr)|0;
      if (cv.width!==needW) cv.width=needW;
      if (cv.height!==needH) cv.height=needH;
      cv.style.width=s.w+"px"; cv.style.height=s.h+"px";
    });
    gClassic.setTransform(s.dpr,0,0,s.dpr,0,0);
    gArt.setTransform(s.dpr,0,0,s.dpr,0,0);
  }

  // ---------- Axis helpers ----------
  var margin={l:70,r:20,t:30,b:50};
  function bounds(rows, equal){
    if (!rows.length) return {xmin:0,xmax:1,ymin:0,ymax:1};
    var xs=rows.map(function(r){return r.x;}), ys=rows.map(function(r){return r.y;});
    var minx=Math.min.apply(null,xs), maxx=Math.max.apply(null,xs), miny=Math.min.apply(null,ys), maxy=Math.max.apply(null,ys);
    if (!isFinite(minx)||!isFinite(maxx)||!isFinite(miny)||!isFinite(maxy)) return {xmin:0,xmax:1,ymin:0,ymax:1};
    var padx=(maxx-minx||1)*0.05, pady=(maxy-miny||1)*0.05;
    var b={xmin:minx-padx,xmax:maxx+padx,ymin:miny-pady,ymax:maxy+pady};
    if (equal){ var mi=Math.min(b.xmin,b.ymin), ma=Math.max(b.xmax,b.ymax); b={xmin:mi,xmax:ma,ymin:mi,ymax:ma}; }
    return b;
  }
  function niceTicks(min,max,nt){ var span=max-min, step=Math.pow(10,Math.floor(Math.log(span/nt)/Math.LN10)); var err=(nt*step)/span; if(err<=0.15)step*=10; else if(err<=0.35)step*=5; else if(err<=0.75)step*=2; var tmin=Math.ceil(min/step)*step, tmax=Math.floor(max/step)*step; var out=[]; for(var v=tmin; v<=tmax+1e-12; v+=step) out.push(v); return out; }
  function xpix(x,b,W){ return margin.l + (x-b.xmin)/(b.xmax-b.xmin+1e-9)*(W-margin.l-margin.r); }
  function ypix(y,b,H){ return H-margin.b - (y-b.ymin)/(b.ymax-b.ymin+1e-9)*(H-margin.t-margin.b); }
  function drawAxes(ctx,b,W,H,bg){
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    var gx=bg==="white"?"#e5e7eb":"#222", ax=bg==="white"?"#111":"#ddd", tx=bg==="white"?"#111":"#e6e6e6";
    ctx.strokeStyle=ax; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(margin.l,H-margin.b); ctx.lineTo(W-margin.r,H-margin.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(margin.l,margin.t); ctx.lineTo(margin.l,H-margin.b); ctx.stroke();

    var xt=niceTicks(b.xmin,b.xmax,6), yt=niceTicks(b.ymin,b.ymax,6);
    ctx.fillStyle=tx; ctx.textAlign="center"; ctx.textBaseline="top"; ctx.font="12px sans-serif";
    for (var i=0;i<xt.length;i++){
      var xp=xpix(xt[i],b,W); ctx.strokeStyle=gx; ctx.beginPath(); ctx.moveTo(xp,margin.t); ctx.lineTo(xp,H-margin.b); ctx.stroke();
      ctx.fillText(String(+xt[i].toFixed(2)), xp, H-margin.b+4);
    }
    ctx.textAlign="right"; ctx.textBaseline="middle";
    for (i=0;i<yt.length;i++){
      var yp=ypix(yt[i],b,H); ctx.strokeStyle=gx; ctx.beginPath(); ctx.moveTo(margin.l,yp); ctx.lineTo(W-margin.r,yp); ctx.stroke();
      ctx.fillText(String(+yt[i].toFixed(2)), margin.l-6, yp);
    }
  }

  // ---------- Classic plots ----------
  function drawShape(ctx,cx,cy,size,shape,rot,fill,stroke){
    var s=size; ctx.save(); ctx.translate(cx,cy); ctx.rotate(rot||0);
    if (shape==="circle"){ ctx.beginPath(); ctx.arc(0,0,s,0,6.283); if(fill)ctx.fill(); if(stroke)ctx.stroke(); }
    else if (shape==="square"){ ctx.beginPath(); ctx.rect(-s,-s,2*s,2*s); if(fill)ctx.fill(); if(stroke)ctx.stroke(); }
    else if (shape==="diamond"){ ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s,0); ctx.lineTo(0,s); ctx.lineTo(-s,0); ctx.closePath(); if(fill)ctx.fill(); if(stroke)ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s,s); ctx.lineTo(-s,s); ctx.closePath(); if(fill)ctx.fill(); if(stroke)ctx.stroke(); }
    ctx.restore();
  }
  function sd1sd2(rows){
    var n=rows.length; if (n<2) return null;
    var mx=0,my=0; for (var i=0;i<n;i++){ mx+=rows[i].x; my+=rows[i].y; } mx/=n; my/=n;
    var sxx=0,syy=0,sxy=0; for (i=0;i<n;i++){ var dx=rows[i].x-mx, dy=rows[i].y-my; sxx+=dx*dx; syy+=dy*dy; sxy+=dx*dy; }
    sxx/=n; syy/=n; sxy/=n;
    return { sd1: Math.sqrt(0.5*(sxx+syy-2*sxy)), sd2: Math.sqrt(0.5*(sxx+syy+2*sxy)), cx:(mx+my)/2, cy:(mx+my)/2 };
  }
  function cats(rows){ var s={}; for (var i=0;i<rows.length;i++){ var c=rows[i].category; if (c!=null) s[String(c)]=1; } var k=Object.keys(s); return k.length?k:["_"]; }
  function legend(ctx, list, W, bg){
    if (list.length===1 && list[0]==="_") return;
    var x=W-margin.r-10, y=margin.t+6; ctx.save(); ctx.textAlign="right"; ctx.textBaseline="middle"; ctx.font="12px sans-serif";
    for (var i=0;i<list.length;i++){
      ctx.fillStyle=bg==="white"?"#111":"#e6e6e6"; ctx.fillText(list[i], x-16, y+14*i);
      ctx.fillStyle="#6aa9ff"; ctx.fillRect(x-10, y-6+14*i, 10,10);
    } ctx.restore();
  }

  function filterData(rows, C) {
    if (!rows.length) return rows;
    var startIdx = Math.floor((C.dataStart / 100) * rows.length);
    var endIdx = Math.floor((C.dataEnd / 100) * rows.length);
    return rows.slice(startIdx, Math.max(startIdx + 1, endIdx));
  }

  function drawClassic(){
    var C=cfg(), s=cssSize(), W=s.w, H=s.h;
    var allRows=P.rows.slice(0); if (!allRows.length){ gClassic.clearRect(0,0,W,H); return; }
    var rows=filterData(allRows, C);
    var b=bounds(rows,C.equal);
    drawAxes(gClassic,b,W,H,C.bg);

    if (C.plotType==="scatter" || C.plotType==="poincare"){
      var ls=cats(rows);
      var outline = C.outline ? (C.bg==="white"?"rgba(0,0,0,0.7)":"rgba(255,255,255,0.7)") : "transparent";
      gClassic.lineWidth=C.outline?1:0;
      for (var k=0;k<ls.length;k++){
        for (var i=0;i<rows.length;i++){
          var r=rows[i]; var rc=(r.category==null?"_":String(r.category)); if (rc!==ls[k]) continue;
          var xp=xpix(r.x + (C.jitter? (Math.random()-0.5)*C.jitter : 0), b, W);
          var yp=ypix(r.y + (C.jitter? (Math.random()-0.5)*C.jitter : 0), b, H);
          var v=(r.x-b.xmin)/(b.xmax-b.xmin+1e-9);
          gClassic.fillStyle=colorFor(v,C.colorscale,C.opacity);
          gClassic.strokeStyle=outline;
          var rot=(C.rotJitter? seededRand(i+91)*C.rotJitter*Math.PI/180 : 0);
          drawShape(gClassic, xp, yp, C.pointSize, C.shape, rot, true, !!C.outline);
        }
      }
      legend(gClassic, ls, W, C.bg);
    } else if (C.plotType==="poincare-ellipse"){
      var outline2 = C.outline ? (C.bg==="white"?"rgba(0,0,0,0.7)":"rgba(255,255,255,0.7)") : "transparent";
      gClassic.lineWidth=C.outline?1:0;
      for (var i2=0;i2<rows.length;i2++){
        var r2=rows[i2], xp2=xpix(r2.x,b,W), yp2=ypix(r2.y,b,H), vv=(r2.x-b.xmin)/(b.xmax-b.xmin+1e-9);
        gClassic.fillStyle=colorFor(vv,C.colorscale,C.opacity); gClassic.strokeStyle=outline2; drawShape(gClassic,xp2,yp2,C.pointSize,C.shape,0,true,!!C.outline);
      }
      var st=sd1sd2(rows); if (st){
        var rot=Math.PI/4, a=st.sd2, bb=st.sd1;
        gClassic.strokeStyle="#ff6"; gClassic.lineWidth=2; gClassic.beginPath();
        for (var t=0;t<=360;t+=2){
          var rad=t*Math.PI/180, xr=a*Math.cos(rad), yr=bb*Math.sin(rad);
          var X=st.cx + xr*Math.cos(rot) - yr*Math.sin(rot), Y=st.cy + xr*Math.sin(rot) + yr*Math.cos(rot);
          var xpe=xpix(X,b,W), ype=ypix(Y,b,H); if (t===0) gClassic.moveTo(xpe,ype); else gClassic.lineTo(xpe,ype);
        } gClassic.closePath(); gClassic.stroke();
        var minv=Math.min(b.xmin,b.ymin), maxv=Math.max(b.xmax,b.ymax);
        gClassic.strokeStyle=C.bg==="white"?"#444":"#aaa"; gClassic.setLineDash([4,4]); gClassic.beginPath();
        gClassic.moveTo(xpix(minv,b,W), ypix(minv,b,H)); gClassic.lineTo(xpix(maxv,b,W), ypix(maxv,b,H)); gClassic.stroke(); gClassic.setLineDash([]);
      }
    } else if (C.plotType==="hist"){
      var xs=rows.map(function(r){return r.x;});
      var nb=50, minx=b.xmin, maxx=b.xmax, w=(maxx-minx)||1, step=w/nb; var bins=new Array(nb); for (var bi=0;bi<nb;bi++) bins[bi]=0;
      for (var j=0;j<xs.length;j++){ var idx=Math.floor((xs[j]-minx)/step); idx=clamp(idx,0,nb-1); bins[idx]++; }
      var maxc=1; for (j=0;j<nb;j++) if (bins[j]>maxc) maxc=bins[j];
      gClassic.globalAlpha=clamp(C.opacity,0.05,1);
      for (bi=0;bi<nb;bi++){
        var x0=minx+bi*step, x1=x0+step, X0=xpix(x0,b,W), X1=xpix(x1,b,W);
        var barH=(bins[bi]/maxc)*(H-margin.t-margin.b);
        gClassic.fillStyle="#6aa9ff"; gClassic.fillRect(X0, H-margin.b-barH, Math.max(1,(X1-X0)-1), barH);
      }
      gClassic.globalAlpha=1;
    } else if (C.plotType==="density"){
      var GN=clamp(C.gridN,40,240), sigma=Math.max(1,C.bandwidth*0.5);
      var grid=new Float32Array(GN*GN);
      function splat(px,py){
        var r=Math.max(1,Math.floor(3*sigma)), x0=Math.max(0,px-r), x1=Math.min(GN-1,px+r), y0=Math.max(0,py-r), y1=Math.min(GN-1,py+r), two=2*sigma*sigma;
        for (var yy=y0; yy<=y1; yy++){ for (var xx=x0; xx<=x1; xx++){ var dx=xx-px, dy=yy-py; grid[yy*GN+xx]+=Math.exp(-(dx*dx+dy*dy)/two); } }
      }
      for (var i=0;i<rows.length;i++){
        var u=(rows[i].x-b.xmin)/(b.xmax-b.xmin+1e-9), v=(rows[i].y-b.ymin)/(b.ymax-b.ymin+1e-9);
        var gx=Math.floor(u*(GN-1)), gy=Math.floor((1-v)*(GN-1)); if (isFinite(gx)&&isFinite(gy)) splat(gx,gy);
      }
      var mx=0; for (i=0;i<grid.length;i++) if (grid[i]>mx) mx=grid[i];
      for (var y=0;y<GN;y++){
        for (var x=0;x<GN;x++){
          var val=mx? grid[y*GN+x]/mx : 0; if (val<=0) continue;
          gClassic.fillStyle=colorFor(val,C.colorscale,clamp(C.opacity*0.95,0.05,1));
          var X0=margin.l + x*( (W-margin.l-margin.r)/GN ), Y0=margin.t + y*( (H-margin.t-margin.b)/GN );
          gClassic.fillRect(X0, Y0, Math.ceil((W-margin.l-margin.r)/GN)+1, Math.ceil((H-margin.t-margin.b)/GN)+1);
        }
      }
    }
  }

  // ---------- ART helpers ----------
  function artClear(bg){ var s=cssSize(); gArt.save(); gArt.globalCompositeOperation="source-over"; gArt.fillStyle=bg||"#000"; gArt.fillRect(0,0,s.w,s.h); gArt.restore(); }
  function worldToCanvas(x,y,b){
    var s=cssSize(), W=s.w, H=s.h;
    var xr=(x-b.xmin)/(b.xmax-b.xmin+1e-9), yr=(y-b.ymin)/(b.ymax-b.ymin+1e-9);
    return {cx: margin.l + xr*(W-margin.l-margin.r), cy: H-margin.b - yr*(H-margin.t-margin.b)};
  }
  function buildGrid(rows, C, b, W, H){
    var gw=C.gridN, gh=C.gridN, grid=new Float32Array(gw*gh), sigma=Math.max(1,C.bandwidth*0.5);
    function splat(gx,gy){ var r=Math.max(1,Math.floor(3*sigma)), x0=Math.max(0,gx-r), x1=Math.min(gw-1,gx+r), y0=Math.max(0,gy-r), y1=Math.min(gh-1,gy+r), two=2*sigma*sigma;
      for (var yy=y0; yy<=y1; yy++) for (var xx=x0; xx<=x1; xx++){ var dx=xx-gx, dy=yy-gy; grid[yy*gw+xx]+=Math.exp(-(dx*dx+dy*dy)/two); } }
    for (var i=0;i<rows.length;i++){
      var p=worldToCanvas(rows[i].x,rows[i].y,b);
      var gx=Math.floor((p.cx-margin.l)/Math.max(1,(W-margin.l-margin.r)/gw));
      var gy=Math.floor((p.cy-margin.t)/Math.max(1,(H-margin.t-margin.b)/gh));
      if (gx>=0&&gx<gw&&gy>=0&&gy<gh) splat(gx, gh-1-gy);
    }
    var mx=0; for (i=0;i<grid.length;i++) if (grid[i]>mx) mx=grid[i];
    if (mx>0) for (i=0;i<grid.length;i++) grid[i]/=mx;
    return {grid:grid, gw:gw, gh:gh};
  }
  function noise2D(x,y){
    function lerp(a,b,t){ return a+(b-a)*t; }
    function hash(ix,iy){ var n= ix*374761393 + iy*668265263; n=(n^(n>>13))*1274126177; n=(n^(n>>16)); return (n>>>0)/4294967295; }
    var x0=Math.floor(x), y0=Math.floor(y), x1=x0+1, y1=y0+1, sx=x-x0, sy=y-y0;
    var n00=hash(x0,y0), n10=hash(x1,y0), n01=hash(x0,y1), n11=hash(x1,y1);
    var ix0=lerp(n00,n10,sx), ix1=lerp(n01,n11,sx); return lerp(ix0,ix1,sy);
  }

  // ---------- ART renderers ----------
  function artPointillism(){
    var C=cfg(), allRows=P.rows; if (!allRows.length) return;
    var rows=filterData(allRows, C); if (!rows.length) return;
    var b=bounds(rows,C.equal); artClear(C.bg); gArt.globalCompositeOperation=C.blend;
    
    for (var i=0;i<rows.length;i++){
      var r=rows[i], p=worldToCanvas(r.x,r.y,b);
      
      // Apply jitter to position  
      var jitterX = C.jitter ? (seededRand(i*13) - 0.5) * C.jitter * 3 : 0;
      var jitterY = C.jitter ? (seededRand(i*17) - 0.5) * C.jitter * 3 : 0;
      
      // Size affected by pointSize and artIntensity
      var size = C.pointSize * (0.5 + C.artIntensity * 1.5);
      
      // Multiple dots based on artDetail
      var dots = Math.floor(1 + C.artDetail * 1.5);
      for (var d = 0; d < dots; d++) {
        var dotSize = size * (1 - d * 0.15);
        var dotAlpha = C.opacity * (1 - d * 0.2);
        var dotX = p.cx + jitterX + (seededRand(i+d*7) - 0.5) * d * 2;
        var dotY = p.cy + jitterY + (seededRand(i+d*11) - 0.5) * d * 2;
        
        gArt.fillStyle = colorFor((r.x-b.xmin)/(b.xmax-b.xmin+1e-9), C.colorscale, dotAlpha);
        
        if (C.outline) {
          gArt.strokeStyle = (C.bg==="white") ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)";
          gArt.lineWidth = 1;
        }
        
        // Add rotation jitter support
        var rotation = C.rotJitter ? (seededRand(i+d+91) * C.rotJitter * Math.PI / 180) : 0;
        drawShape(gArt, dotX, dotY, dotSize, C.shape, rotation, true, C.outline);
      }
    }
  }
  function artInk(){
    var C=cfg(), allRows=P.rows; if (!allRows.length) return;
    var rows=filterData(allRows, C); if (!rows.length) return;
    var b=bounds(rows,C.equal); artClear(C.bg); gArt.globalCompositeOperation=C.blend;
    
    for (var i=0;i<rows.length;i++){
      var r=rows[i], p=worldToCanvas(r.x,r.y,b), base=2+C.pointSize*1.2;
      
      // Apply jitter to ink blot position
      var jitterX = C.jitter ? (seededRand(i+200) - 0.5) * C.jitter * 3 : 0;
      var jitterY = C.jitter ? (seededRand(i+300) - 0.5) * C.jitter * 3 : 0;
      var inkX = p.cx + jitterX;
      var inkY = p.cy + jitterY;
      
      // Create irregular ink blots with intensity-based spreading
      var spreadLayers = Math.floor(3 + C.artDetail * 2 + C.artIntensity * 4);
      
      for (var k=0; k<spreadLayers; k++){
        var radBase = base + k * (1.5 + C.artIntensity);
        // Create organic, irregular shapes using rotation jitter
        var irregularity = 1 + (C.rotJitter / 180) * 0.5;
        var rad = radBase * (0.8 + seededRand(i+k*7) * 0.4 * irregularity);
        
        var a = Math.max(0, C.opacity*(0.4-0.05*k)*(0.7+0.6*seededRand(i+k*17)));
        
        // Use both x and y for color variation to create more complex patterns
        var colorVal = ((r.x-b.xmin)/(b.xmax-b.xmin+1e-9) + (r.y-b.ymin)/(b.ymax-b.ymin+1e-9)) * 0.5;
        gArt.fillStyle=colorFor(colorVal, C.colorscale, a);
        
        // Create irregular blot shapes
        gArt.beginPath();
        var vertices = 8 + Math.floor(C.artDetail * 4);
        for (var v = 0; v < vertices; v++) {
          var angle = (v / vertices) * 6.283;
          var r_var = rad * (0.7 + 0.6 * seededRand(i+k*13+v*7));
          var x = inkX + r_var * Math.cos(angle);
          var y = inkY + r_var * Math.sin(angle);
          if (v === 0) gArt.moveTo(x, y);
          else gArt.lineTo(x, y);
        }
        gArt.closePath();
        gArt.fill();
      }
      
      // Add splatter effects based on artIntensity
      if (C.artIntensity > 0.3) {
        var splatters = Math.floor(C.artIntensity * 8);
        var baseColorVal = ((r.x-b.xmin)/(b.xmax-b.xmin+1e-9) + (r.y-b.ymin)/(b.ymax-b.ymin+1e-9)) * 0.5;
        for (var s = 0; s < splatters; s++) {
          var splatAngle = seededRand(i+s*23) * 6.283;
          var splatDist = (20 + seededRand(i+s*29) * 30) * C.artIntensity;
          var splatX = inkX + splatDist * Math.cos(splatAngle);
          var splatY = inkY + splatDist * Math.sin(splatAngle);
          var splatRad = (1 + seededRand(i+s*31) * 3) * C.pointSize * 0.3;
          
          gArt.fillStyle=colorFor(baseColorVal, C.colorscale, C.opacity * 0.6);
          gArt.beginPath();
          gArt.arc(splatX, splatY, splatRad, 0, 6.283);
          gArt.fill();
        }
      }
    }
  }
  function artFlow(){
    var C=cfg(), allRows=P.rows; if (!allRows.length) return;
    var rows=filterData(allRows, C); if (!rows.length) return;
    var b=bounds(rows,C.equal); artClear(C.bg); gArt.globalCompositeOperation=C.blend;
    
    gArt.lineWidth = Math.max(0.5, C.pointSize * 0.4);
    var stride = Math.max(1, 4 - C.artDetail);
    
    for (var i=0; i<rows.length; i+=stride){
      var r=rows[i], p=worldToCanvas(r.x,r.y,b);
      
      // Apply jitter to starting position
      var startX = p.cx + (C.jitter ? (seededRand(i+100) - 0.5) * C.jitter * 6 : 0);
      var startY = p.cy + (C.jitter ? (seededRand(i+150) - 0.5) * C.jitter * 6 : 0);
      
      var hue = (r.x-b.xmin)/(b.xmax-b.xmin+1e-9);
      gArt.strokeStyle = colorFor(hue, C.colorscale, 0.2 + 0.6*C.opacity);
      
      gArt.beginPath();
      var px = startX, py = startY;
      gArt.moveTo(px, py);
      
      var steps = 20 + Math.floor(40 * C.artIntensity) + Math.floor(20 * C.artDetail);
      
      for (var t=0; t<steps; t++){
        var nx = noise2D(px*0.01, py*0.01) - 0.5;
        var ny = noise2D((px+100)*0.01, (py+100)*0.01) - 0.5;
        
        // Add rotation influence
        if (C.rotJitter > 0) {
          var angle = C.rotJitter * 0.01;
          var cos = Math.cos(angle), sin = Math.sin(angle);
          var tempX = nx;
          nx = nx * cos - ny * sin;
          ny = tempX * sin + ny * cos;
        }
        
        var speed = 1 + 3 * C.artIntensity;
        px += nx * speed * 4;
        py += ny * speed * 4;
        gArt.lineTo(px, py);
      }
      gArt.stroke();
    }
  }
  function artMetaballs(){
    var C=cfg(), allRows=P.rows, s=cssSize(); if (!allRows.length) return;
    var rows=filterData(allRows, C); if (!rows.length) return;
    var b=bounds(rows,C.equal); artClear(C.bg); 
    gArt.globalCompositeOperation=C.blend;
    
    var stride = Math.max(1, Math.floor(6 - C.artDetail));
    
    for (var i = 0; i < rows.length; i += stride) {
      var r = rows[i];
      var p = worldToCanvas(r.x, r.y, b);
      
      var jitterX = C.jitter ? (seededRand(i*7) - 0.5) * C.jitter * 8 : 0;
      var jitterY = C.jitter ? (seededRand(i*11) - 0.5) * C.jitter * 8 : 0;
      
      var baseSize = C.pointSize * (2 + C.artIntensity * 4);
      
      // Create multiple overlapping circles with rotation effects
      var circles = Math.floor(3 + C.artDetail * 2);
      for (var c = 0; c < circles; c++) {
        var circleSize = baseSize * (1 - c * 0.15);
        var circleAlpha = C.opacity * (0.3 - c * 0.05);
        
        // Add rotation jitter to offset positions
        var angle = C.rotJitter ? (seededRand(i+c*19) * C.rotJitter * Math.PI / 180) : (c * Math.PI / 3);
        var offsetX = Math.cos(angle) * circleSize * 0.4;
        var offsetY = Math.sin(angle) * circleSize * 0.4;
        
        gArt.fillStyle = colorFor((r.x-b.xmin)/(b.xmax-b.xmin+1e-9), C.colorscale, circleAlpha);
        gArt.beginPath();
        gArt.arc(p.cx + jitterX + offsetX, p.cy + jitterY + offsetY, circleSize, 0, 6.283);
        gArt.fill();
      }
    }
  }

  function artContours() {
    var C = cfg(), allRows = P.rows, s = cssSize();
    if (!allRows.length) return;
    var rows = filterData(allRows, C); if (!rows.length) return;
    var b = bounds(rows, C.equal);
    artClear(C.bg);
    gArt.globalCompositeOperation = C.blend;
    
    var built = buildGrid(rows, C, b, s.w, s.h);
    var grid = built.grid, gw = built.gw, gh = built.gh;

    function segsFromGrid(grid, gw, gh, iso) {
      var segments = [];
      var x, y;

      function interp(p1, p2, val1, val2) {
        if (Math.abs(val1 - val2) < 1e-9) return p1;
        var t = (iso - val1) / (val2 - val1);
        return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
      }
      for (y = 0; y < gh - 1; y++) {
        for (x = 0; x < gw - 1; x++) {
          var i = y * gw + x;
          var v = [grid[i], grid[i + 1], grid[i + gw + 1], grid[i + gw]];
          var p = [
            [x, y],
            [x + 1, y],
            [x + 1, y + 1],
            [x, y + 1]
          ];
          var idx = 0;
          if (v[0] < iso) idx |= 1;
          if (v[1] < iso) idx |= 2;
          if (v[2] < iso) idx |= 4;
          if (v[3] < iso) idx |= 8;
          switch (idx) {
            case 1:
            case 14:
              segments.push([interp(p[0], p[3], v[0], v[3]), interp(p[0], p[1], v[0], v[1])]);
              break;
            case 2:
            case 13:
              segments.push([interp(p[0], p[1], v[0], v[1]), interp(p[1], p[2], v[1], v[2])]);
              break;
            case 3:
            case 12:
              segments.push([interp(p[0], p[3], v[0], v[3]), interp(p[1], p[2], v[1], v[2])]);
              break;
            case 4:
            case 11:
              segments.push([interp(p[1], p[2], v[1], v[2]), interp(p[2], p[3], v[2], v[3])]);
              break;
            case 5:
              segments.push([interp(p[0], p[3], v[0], v[3]), interp(p[2], p[3], v[2], v[3])]);
              segments.push([interp(p[0], p[1], v[0], v[1]), interp(p[1], p[2], v[1], v[2])]);
              break;
            case 6:
            case 9:
              segments.push([interp(p[0], p[1], v[0], v[1]), interp(p[2], p[3], v[2], v[3])]);
              break;
            case 7:
            case 8:
              segments.push([interp(p[0], p[3], v[0], v[3]), interp(p[2], p[3], v[2], v[3])]);
              break;
            case 10:
              segments.push([interp(p[0], p[1], v[0], v[1]), interp(p[0], p[3], v[0], v[3])]);
              segments.push([interp(p[1], p[2], v[1], v[2]), interp(p[2], p[3], v[2], v[3])]);
              break;
          }
        }
      }
      return segments;
    }
    // Draw contours with all slider effects
    for (var l = 1; l < C.levels; l++) {
      var iso = l / C.levels;
      var segs = segsFromGrid(grid, gw, gh, iso);
      
      // Line width affected by pointSize and artDetail
      var baseWidth = Math.max(0.5, C.pointSize * 0.3 + C.artDetail * 0.5);
      
      // Glow effect based on artIntensity
      var glowPasses = Math.floor(C.artIntensity * 3 + 1);
      
      for (var pass = glowPasses; pass >= 0; pass--) {
        var lineWidth = baseWidth + pass * C.artIntensity * 2;
        var alpha = pass === 0 ? C.opacity : C.opacity * 0.2 / Math.max(1, pass);
        
        gArt.lineWidth = lineWidth;
        gArt.strokeStyle = colorFor(iso, C.colorscale, alpha);
        gArt.beginPath();
        
        for (var i = 0; i < segs.length; i++) {
          // Apply jitter to contour positions
          var jx1 = C.jitter ? (seededRand(i*2) - 0.5) * C.jitter * 2 : 0;
          var jy1 = C.jitter ? (seededRand(i*2+1) - 0.5) * C.jitter * 2 : 0;
          var jx2 = C.jitter ? (seededRand(i*2+2) - 0.5) * C.jitter * 2 : 0;
          var jy2 = C.jitter ? (seededRand(i*2+3) - 0.5) * C.jitter * 2 : 0;
          
          var p1x = margin.l + (segs[i][0][0] / gw) * (s.w - margin.l - margin.r) + jx1;
          var p1y = margin.t + (segs[i][0][1] / gh) * (s.h - margin.t - margin.b) + jy1;
          var p2x = margin.l + (segs[i][1][0] / gw) * (s.w - margin.l - margin.r) + jx2;
          var p2y = margin.t + (segs[i][1][1] / gh) * (s.h - margin.t - margin.b) + jy2;
          
          // Apply rotation jitter
          if (C.rotJitter > 0) {
            var centerX = (p1x + p2x) * 0.5, centerY = (p1y + p2y) * 0.5;
            var rotAngle = (seededRand(i+l*17) - 0.5) * C.rotJitter * Math.PI / 360;
            var cos = Math.cos(rotAngle), sin = Math.sin(rotAngle);
            var dx1 = p1x - centerX, dy1 = p1y - centerY;
            var dx2 = p2x - centerX, dy2 = p2y - centerY;
            p1x = centerX + dx1 * cos - dy1 * sin;
            p1y = centerY + dx1 * sin + dy1 * cos;
            p2x = centerX + dx2 * cos - dy2 * sin;
            p2y = centerY + dx2 * sin + dy2 * cos;
          }
          
          gArt.moveTo(p1x, p1y);
          gArt.lineTo(p2x, p2y);
        }
        gArt.stroke();
      }
    }
  }

  function artHalftone() {
    var C = cfg(), allRows = P.rows, s = cssSize();
    if (!allRows.length) return;
    var rows = filterData(allRows, C); if (!rows.length) return;
    var b = bounds(rows, C.equal);
    artClear(C.bg);
    gArt.globalCompositeOperation = C.blend;
    
    var built = buildGrid(rows, C, b, s.w, s.h);
    var grid = built.grid, gw = built.gw, gh = built.gh;
    var cellW = (s.w - margin.l - margin.r) / gw;
    var cellH = (s.h - margin.t - margin.b) / gh;
    
    for (var y = 0; y < gh; y++) {
      for (var x = 0; x < gw; x++) {
        var val = grid[y * gw + x];
        if (val <= 0.01) continue;
        
        // Dot size influenced by artIntensity and pointSize
        var baseR = Math.sqrt(val) * Math.min(cellW, cellH) * 0.4;
        var r = baseR * (0.3 + C.artIntensity * 0.7) * (0.5 + C.pointSize / 18);
        if (r < 0.5) continue;
        
        // Position with jitter
        var jitterX = C.jitter ? (seededRand(x*17+y*23) - 0.5) * C.jitter * cellW * 0.2 : 0;
        var jitterY = C.jitter ? (seededRand(x*19+y*29) - 0.5) * C.jitter * cellH * 0.2 : 0;
        var dotX = margin.l + (x + 0.5) * cellW + jitterX;
        var dotY = margin.t + (y + 0.5) * cellH + jitterY;
        
        gArt.fillStyle = colorFor(val, C.colorscale, C.opacity);
        
        // Shape and rotation based on artDetail and rotJitter
        if (C.artDetail <= 2) {
          gArt.beginPath();
          gArt.arc(dotX, dotY, r, 0, 6.283);
          gArt.fill();
        } else {
          var rotation = C.rotJitter ? (seededRand(x*13+y*17) - 0.5) * C.rotJitter * Math.PI / 180 : 0;
          drawShape(gArt, dotX, dotY, r, C.shape, rotation, true, false);
        }
      }
    }
  }

  function artRD() {
    var C = cfg(), allRows = P.rows, s = cssSize();
    if (!allRows.length) return;
    var rows = filterData(allRows, C); if (!rows.length) return;
    var b = bounds(rows, C.equal);
    artClear(C.bg);
    gArt.globalCompositeOperation = C.blend;
    
    // Grid size affected by gridN
    var gw = Math.floor(C.gridN * 0.6), gh = Math.floor(C.gridN * 0.6);
    var gridA = new Float32Array(gw * gh);
    var gridB = new Float32Array(gw * gh);
    
    // Initialize A to 1
    for (var i = 0; i < gridA.length; i++) gridA[i] = 1;
    
    // Seed B at data points with jitter and pointSize effects
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k];
      var p = worldToCanvas(r.x, r.y, b);
      
      var jitterX = C.jitter ? (seededRand(k*7) - 0.5) * C.jitter * 8 : 0;
      var jitterY = C.jitter ? (seededRand(k*11) - 0.5) * C.jitter * 8 : 0;
      
      var gx = Math.floor(clamp(((p.cx + jitterX) / s.w) * gw, 0, gw - 1));
      var gy = Math.floor(clamp(((p.cy + jitterY) / s.h) * gh, 0, gh - 1));
      
      var radius = Math.floor(1 + C.pointSize * 0.4);
      for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
          if (dx*dx + dy*dy <= radius*radius) {
            var idx = (gy + dy) * gw + (gx + dx);
            if (idx >= 0 && idx < gridB.length) gridB[idx] = 1;
          }
        }
      }
    }
    
    var f = C.rdFeed, kill = C.rdKill, dA = 1.0, dB = 0.5;
    
    // Run simulation (limited steps for performance)
    var maxSteps = Math.min(C.rdSteps, 150);
    for (var step = 0; step < maxSteps; step++) {
      var nextA = new Float32Array(gw * gh);
      var nextB = new Float32Array(gw * gh);
      
      for (var y = 1; y < gh - 1; y++) {
        for (var x = 1; x < gw - 1; x++) {
          var i = y * gw + x;
          var laplaceA = gridA[i-1] + gridA[i+1] + gridA[i-gw] + gridA[i+gw] - 4*gridA[i];
          var laplaceB = gridB[i-1] + gridB[i+1] + gridB[i-gw] + gridB[i+gw] - 4*gridB[i];
          var reaction = gridA[i] * gridB[i] * gridB[i];
          
          nextA[i] = Math.max(0, Math.min(1, gridA[i] + (dA * laplaceA - reaction + f * (1 - gridA[i]))));
          nextB[i] = Math.max(0, Math.min(1, gridB[i] + (dB * laplaceB + reaction - (kill + f) * gridB[i])));
        }
      }
      gridA = nextA; gridB = nextB;
    }
    
    // Simple circle-based rendering for better performance
    for (var y = 0; y < gh; y++) {
      for (var x = 0; x < gw; x++) {
        var val = gridB[y * gw + x];
        if (val > 0.3) {
          var intensity = Math.min(1, val * 2);
          var px = (x / gw) * (s.w - margin.l - margin.r) + margin.l;
          var py = (y / gh) * (s.h - margin.t - margin.b) + margin.t;
          var size = intensity * 3 + 1;
          
          gArt.fillStyle = colorFor(intensity, C.colorscale, C.opacity * intensity);
          gArt.beginPath();
          gArt.arc(px, py, size, 0, 6.283);
          gArt.fill();
        }
      }
    }
  }

  // ---------- Slider visibility control ----------
  function updateSliderVisibility() {
    var plotType = $("#plotType").value;
    
    // Define which slider groups are active for each plot type
    var sliderConfig = {
      "scatter": ["basic-sliders", "jitter-sliders"],
      "hist": ["basic-sliders"],
      "density": ["basic-sliders", "grid-sliders"],
      "poincare": ["basic-sliders", "jitter-sliders"],
      "poincare-ellipse": ["basic-sliders", "jitter-sliders"],
      "art-pointillism": ["basic-sliders", "jitter-sliders", "art-sliders"],
      "art-ink": ["basic-sliders", "jitter-sliders", "art-sliders"],
      "art-flow": ["basic-sliders", "jitter-sliders", "art-sliders"],
      "art-metaballs": ["basic-sliders", "jitter-sliders", "art-sliders"],
      "art-contours": ["basic-sliders", "jitter-sliders", "art-sliders", "grid-sliders"],
      "art-halftone": ["basic-sliders", "jitter-sliders", "art-sliders", "grid-sliders"],
      "art-rd": ["basic-sliders", "jitter-sliders", "simulation-sliders", "rd-sliders"]
    };
    
    var activeSliders = sliderConfig[plotType] || ["basic-sliders"];
    var allSliderGroups = ["basic-sliders", "jitter-sliders", "art-sliders", "grid-sliders", "simulation-sliders", "rd-sliders"];
    
    // Show/hide slider groups
    allSliderGroups.forEach(function(groupId) {
      var group = $("#" + groupId);
      if (group) {
        if (activeSliders.includes(groupId)) {
          group.classList.remove("slider-inactive");
          group.classList.add("slider-active");
        } else {
          group.classList.remove("slider-active");
          group.classList.add("slider-inactive");
        }
      }
    });
  }

  // ---------- Main control flow ----------
  function render() {
    var C = cfg();
    updateSliderVisibility();
    
    if (P.rows.length === 0) {
      art.style.display = "none";
      classic.style.display = "block";
      var s = cssSize();
      gClassic.clearRect(0, 0, s.w, s.h);
      return;
    }
    var isArt = C.plotType.startsWith("art-");
    art.style.display = isArt ? "block" : "none";
    classic.style.display = isArt ? "none" : "block";
    if (isArt) {
      artClear(C.bg);
      switch (C.plotType) {
        case "art-pointillism":
          artPointillism();
          break;
        case "art-ink":
          artInk();
          break;
        case "art-flow":
          artFlow();
          break;
        case "art-metaballs":
          artMetaballs();
          break;
        case "art-contours":
          artContours();
          break;
        case "art-halftone":
          artHalftone();
          break;
        case "art-rd":
          artRD();
          break;
      }
    } else {
      drawClassic();
    }
  }

  function loadData(text, name) {
    var result = parseCSV(text);
    P.rows = result.rows;
    P.series = result.series;
    P.datasetName = name || "(clipboard)";
    P.source = text;
    updateInfo();
    render();
  }

  // ---------- Event listeners ----------
  function setupListeners() {
    window.addEventListener("resize", () => {
      resizeBoth();
      render();
    });
    document.querySelectorAll("input, select").forEach(el => {
      el.addEventListener("change", () => {
        updatePills();
        render();
      });
      if (el.type === 'range') {
        el.addEventListener("input", () => {
          updatePills();
          render(); // Update all sliders in real-time
        });
      }
    });
    $("#file").addEventListener("change", (e) => {
      var f = e.target.files[0];
      if (f) {
        var r = new FileReader();
        r.onload = (ev) => loadData(ev.target.result, f.name);
        r.readAsText(f);
      }
    });
    $("#useSample").addEventListener("click", () => {
      var sample = "x,y,category\n";
      for (var i = 0; i < 200; i++) {
        var ang = Math.random() * 6.28,
          r = 5 + Math.random() * 5;
        var cat = i < 100 ? "A" : "B";
        var jx = (Math.random() - 0.5) * (cat === 'A' ? 2 : 4);
        var jy = (Math.random() - 0.5) * (cat === 'A' ? 2 : 4);
        sample += `${r*Math.cos(ang)+jx},${r*Math.sin(ang)+jy},${cat}\n`;
      }
      loadData(sample, "sample.csv");
    });
    $("#toPoincare").addEventListener("click", () => {
      if (!P.series) {
        alert("This operation requires 1-column numeric data (a time series).");
        return;
      }
      P.rows = toPoincare(P.rows);
      P.series = false;
      P.datasetName += " (Poincaré)";
      updateInfo();
      $("#plotType").value = "poincare";
      render();
    });
    $("#exportPNG").addEventListener("click", () => {
      var C = cfg();
      var canvas = C.plotType.startsWith('art-') ? art : classic;
      var link = document.createElement('a');
      link.download = `viz-${C.plotType}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
    $("#exportHTML").addEventListener("click", () => {
      var C = cfg();
      var html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Saved Viz: ${C.plotType}</title>
<style>body{margin:0;background:#000;display:grid;place-items:center;height:100vh}img{max-width:100vw;max-height:100vh}</style>
</head>
<body><img src="${(C.plotType.startsWith('art-')?art:classic).toDataURL("image/png")}" alt="Exported visualization"></body>
</html>`;
      var blob = new Blob([html], {
        type: "text/html"
      });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `viz-${C.plotType}-${Date.now()}.html`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
    $("#exportJSON").addEventListener("click", () => {
      var C = cfg();
      var state = {
        config: C,
        data: P.source,
        datasetName: P.datasetName,
      };
      var blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json"
      });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `viz-manifest-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
    $("#saveState").addEventListener("click", () => {
      var C = cfg();
      localStorage.setItem("viz-workbench-state", JSON.stringify(C));
      alert("Settings saved.");
    });
  }
  function loadState() {
    var saved = localStorage.getItem("viz-workbench-state");
    if (saved) {
      var C = JSON.parse(saved);
      Object.keys(C).forEach(k => {
        var el = $("#" + k);
        if (el) {
          if (el.type === 'checkbox') el.checked = C[k];
          else el.value = C[k];
        }
      });
    }
  }
  // ---------- Init ----------
  resizeBoth();
  setupListeners();
  loadState();
  updatePills();
  updateSliderVisibility();
  render();
})();