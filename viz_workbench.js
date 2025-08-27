(function(){
  "use strict";
  // ---------- Shortcuts ----------
  function $(s){ return document.querySelector(s); }
  function clamp(v,a,b){ return v<a? a : v>b? b : v; }
  function seededRand(i){ var t=(i*9301+49297)%233280; return (t/233280); }

  // ---------- App state ----------
  var P={ rows:[], series:false, datasetName:"(none)", source:"", schema:"x,y,(category?)" };
  var zoomState = { level: 1.0, centerX: 0, centerY: 0 };
  var visualizationBounds = {}; // Cache of pre-calculated bounds for each plot type

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
    frame: $("#frame").checked,
    axes: $("#axes").checked,
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
    $("#zoomv").textContent=Math.round(zoomState.level * 100)+"%";
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
    
    // Apply zoom and pan
    var cx = (b.xmin + b.xmax) * 0.5 + zoomState.centerX;
    var cy = (b.ymin + b.ymax) * 0.5 + zoomState.centerY;
    var zoomFactor = 1.0 / zoomState.level;
    var dx = (b.xmax - b.xmin) * zoomFactor * 0.5;
    var dy = (b.ymax - b.ymin) * zoomFactor * 0.5;
    
    return {xmin:cx-dx, xmax:cx+dx, ymin:cy-dy, ymax:cy+dy};
  }
  function niceTicks(min,max,nt){ var span=max-min, step=Math.pow(10,Math.floor(Math.log(span/nt)/Math.LN10)); var err=(nt*step)/span; if(err<=0.15)step*=10; else if(err<=0.35)step*=5; else if(err<=0.75)step*=2; var tmin=Math.ceil(min/step)*step, tmax=Math.floor(max/step)*step; var out=[]; for(var v=tmin; v<=tmax+1e-12; v+=step) out.push(v); return out; }
  function xpix(x,b,W){ return margin.l + (x-b.xmin)/(b.xmax-b.xmin+1e-9)*(W-margin.l-margin.r); }
  function ypix(y,b,H){ return H-margin.b - (y-b.ymin)/(b.ymax-b.ymin+1e-9)*(H-margin.t-margin.b); }
  function drawAxes(ctx,b,W,H,bg,C){
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    var gx=bg==="white"?"#e5e7eb":"#222", ax=bg==="white"?"#111":"#ddd", tx=bg==="white"?"#111":"#e6e6e6";
    
    if (C.axes) {
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
    
    // Draw frame box
    if (C.frame) {
      ctx.strokeStyle = ax;
      ctx.lineWidth = 2;
      ctx.strokeRect(margin.l, margin.t, W-margin.l-margin.r, H-margin.t-margin.b);
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
    var b=getOptimizedBounds(C.plotType, C.equal);
    drawAxes(gClassic,b,W,H,C.bg,C);

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
    } else if (C.plotType==="bubble"){
      // Bubble chart with size encoding
      var ls=cats(rows);
      var outline = C.outline ? (C.bg==="white"?"rgba(0,0,0,0.7)":"rgba(255,255,255,0.7)") : "transparent";
      gClassic.lineWidth=C.outline?1:0;
      
      // Calculate size range based on data spread
      var maxDist = 0;
      for (var i=0;i<rows.length;i++) {
        var dist = Math.sqrt(rows[i].x*rows[i].x + rows[i].y*rows[i].y);
        if (dist > maxDist) maxDist = dist;
      }
      
      for (var k=0;k<ls.length;k++){
        for (var i=0;i<rows.length;i++){
          var r=rows[i]; var rc=(r.category==null?"_":String(r.category)); if (rc!==ls[k]) continue;
          var xp=xpix(r.x + (C.jitter? (Math.random()-0.5)*C.jitter : 0), b, W);
          var yp=ypix(r.y + (C.jitter? (Math.random()-0.5)*C.jitter : 0), b, H);
          
          // Size based on distance from origin + base point size
          var dist = Math.sqrt(r.x*r.x + r.y*r.y);
          var normalizedSize = dist / (maxDist || 1);
          var bubbleSize = C.pointSize * (0.8 + normalizedSize * 2);
          
          var v=(r.x-b.xmin)/(b.xmax-b.xmin+1e-9);
          gClassic.fillStyle=colorFor(v,C.colorscale,C.opacity);
          gClassic.strokeStyle=outline;
          
          gClassic.beginPath();
          gClassic.arc(xp, yp, bubbleSize, 0, 6.283);
          gClassic.fill();
          if (C.outline) gClassic.stroke();
        }
      }
      legend(gClassic, ls, W, C.bg);
    } else if (C.plotType==="connected"){
      // Connected scatter plot
      var ls=cats(rows);
      gClassic.lineWidth = Math.max(1, C.pointSize * 0.3);
      
      for (var k=0;k<ls.length;k++){
        var categoryRows = [];
        for (var i=0;i<rows.length;i++){
          var r=rows[i]; var rc=(r.category==null?"_":String(r.category));
          if (rc===ls[k]) categoryRows.push(r);
        }
        
        // Sort by x value for smooth connections
        categoryRows.sort(function(a,b) { return a.x - b.x; });
        
        if (categoryRows.length > 1) {
          // Draw connecting lines
          gClassic.strokeStyle = colorFor((k / Math.max(1,ls.length-1)), C.colorscale, C.opacity * 0.7);
          gClassic.beginPath();
          for (var i=0;i<categoryRows.length;i++) {
            var xp = xpix(categoryRows[i].x, b, W);
            var yp = ypix(categoryRows[i].y, b, H);
            if (i === 0) gClassic.moveTo(xp, yp);
            else gClassic.lineTo(xp, yp);
          }
          gClassic.stroke();
          
          // Draw points on top
          gClassic.fillStyle = colorFor((k / Math.max(1,ls.length-1)), C.colorscale, C.opacity);
          for (var i=0;i<categoryRows.length;i++) {
            var r = categoryRows[i];
            var xp = xpix(r.x, b, W);
            var yp = ypix(r.y, b, H);
            gClassic.beginPath();
            gClassic.arc(xp, yp, C.pointSize, 0, 6.283);
            gClassic.fill();
          }
        }
      }
      legend(gClassic, ls, W, C.bg);
    } else if (C.plotType==="hexbin"){
      // Hexagonal binning
      var hexSize = C.pointSize * 2 + C.bandwidth * 0.5;
      var hexMap = {};
      
      // Bin points into hexagons
      for (var i=0;i<rows.length;i++) {
        var r = rows[i];
        var xp = xpix(r.x, b, W);
        var yp = ypix(r.y, b, H);
        
        // Convert to hex coordinates
        var hx = Math.floor(xp / (hexSize * 1.5));
        var hy = Math.floor(yp / (hexSize * Math.sqrt(3)));
        
        // Offset every other column
        if (hx % 2) hy += 0.5;
        hy = Math.floor(hy);
        
        var key = hx + "," + hy;
        hexMap[key] = (hexMap[key] || 0) + 1;
      }
      
      // Draw hexagons
      var maxCount = 0;
      for (var key in hexMap) {
        if (hexMap[key] > maxCount) maxCount = hexMap[key];
      }
      
      for (var key in hexMap) {
        var coords = key.split(",");
        var hx = parseInt(coords[0]);
        var hy = parseInt(coords[1]);
        var count = hexMap[key];
        
        var centerX = hx * hexSize * 1.5;
        var centerY = (hy - (hx % 2) * 0.5) * hexSize * Math.sqrt(3);
        
        var intensity = count / maxCount;
        gClassic.fillStyle = colorFor(intensity, C.colorscale, C.opacity);
        
        // Draw hexagon
        gClassic.beginPath();
        for (var v = 0; v < 6; v++) {
          var angle = v * Math.PI / 3;
          var x = centerX + hexSize * Math.cos(angle);
          var y = centerY + hexSize * Math.sin(angle);
          if (v === 0) gClassic.moveTo(x, y);
          else gClassic.lineTo(x, y);
        }
        gClassic.closePath();
        gClassic.fill();
        
        if (C.outline) {
          gClassic.strokeStyle = C.bg==="white" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)";
          gClassic.lineWidth = 1;
          gClassic.stroke();
        }
      }
    } else if (C.plotType==="surface3d"){
      // Isometric 3D surface plot
      var gridSize = 15 + Math.floor(C.gridN * 0.15);
      var surface = [];
      
      // Initialize height grid
      for (var y = 0; y < gridSize; y++) {
        surface[y] = [];
        for (var x = 0; x < gridSize; x++) {
          surface[y][x] = 0;
        }
      }
      
      // Map data points to grid and accumulate heights
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var gridX = Math.floor(((r.x - b.xmin) / (b.xmax - b.xmin)) * (gridSize - 1));
        var gridY = Math.floor(((r.y - b.ymin) / (b.ymax - b.ymin)) * (gridSize - 1));
        
        if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
          surface[gridY][gridX] += 1;
        }
      }
      
      // Smooth the surface for better visualization
      for (var smooth = 0; smooth < 2; smooth++) {
        var newSurface = surface.map(row => [...row]);
        for (var y = 1; y < gridSize - 1; y++) {
          for (var x = 1; x < gridSize - 1; x++) {
            newSurface[y][x] = (surface[y-1][x] + surface[y+1][x] + 
                               surface[y][x-1] + surface[y][x+1] + 
                               surface[y][x] * 4) / 8;
          }
        }
        surface = newSurface;
      }
      
      // Find max height for normalization
      var maxHeight = 0;
      for (var y = 0; y < gridSize; y++) {
        for (var x = 0; x < gridSize; x++) {
          if (surface[y][x] > maxHeight) maxHeight = surface[y][x];
        }
      }
      
      // Draw isometric surface
      var scale = Math.min(W - margin.l - margin.r, H - margin.t - margin.b) / gridSize * 0.5;
      var centerX = (W + margin.l - margin.r) / 2;
      var centerY = (H + margin.t - margin.b) / 2;
      
      // Isometric transformation function
      function isoProject(x, y, z) {
        var isoX = (x - y) * Math.cos(Math.PI / 6) * scale;
        var isoY = (x + y) * Math.sin(Math.PI / 6) * scale - z * scale * (C.pointSize / 18);
        return { x: centerX + isoX, y: centerY + isoY };
      }
      
      // Draw surface faces back to front for proper occlusion
      for (var y = gridSize - 2; y >= 0; y--) {
        for (var x = 0; x < gridSize - 1; x++) {
          var h1 = surface[y][x] / (maxHeight || 1);
          var h2 = surface[y][x+1] / (maxHeight || 1);
          var h3 = surface[y+1][x+1] / (maxHeight || 1);
          var h4 = surface[y+1][x] / (maxHeight || 1);
          
          var p1 = isoProject(x, y, h1 * 5);
          var p2 = isoProject(x+1, y, h2 * 5);
          var p3 = isoProject(x+1, y+1, h3 * 5);
          var p4 = isoProject(x, y+1, h4 * 5);
          
          var avgHeight = (h1 + h2 + h3 + h4) / 4;
          gClassic.fillStyle = colorFor(avgHeight, C.colorscale, C.opacity);
          
          if (C.outline) {
            gClassic.strokeStyle = C.bg === "white" ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)";
            gClassic.lineWidth = 0.5;
          }
          
          gClassic.beginPath();
          gClassic.moveTo(p1.x, p1.y);
          gClassic.lineTo(p2.x, p2.y);
          gClassic.lineTo(p3.x, p3.y);
          gClassic.lineTo(p4.x, p4.y);
          gClassic.closePath();
          gClassic.fill();
          if (C.outline) gClassic.stroke();
        }
      }
    } else if (C.plotType==="violin"){
      // Violin plot showing distribution shape for each category
      var ls=cats(rows);
      var violinWidth = (W - margin.l - margin.r) / Math.max(1, ls.length) * 0.8;
      
      for (var k=0; k<ls.length; k++) {
        var categoryData = [];
        for (var i=0; i<rows.length; i++) {
          var r = rows[i];
          var rc = (r.category==null ? "_" : String(r.category));
          if (rc === ls[k]) categoryData.push(r.y);
        }
        
        if (categoryData.length > 2) {
          // Sort data for violin shape
          categoryData.sort(function(a,b) { return a - b; });
          
          var centerX = margin.l + (k + 0.5) * violinWidth * 1.25;
          var minY = Math.min.apply(null, categoryData);
          var maxY = Math.max.apply(null, categoryData);
          
          // Create density curve
          var bins = Math.min(20, Math.max(5, Math.floor(categoryData.length / 10)));
          var binSize = (maxY - minY) / bins;
          var density = new Array(bins);
          
          for (var bin = 0; bin < bins; bin++) {
            density[bin] = 0;
            var binMin = minY + bin * binSize;
            var binMax = binMin + binSize;
            
            for (var d = 0; d < categoryData.length; d++) {
              if (categoryData[d] >= binMin && categoryData[d] < binMax) {
                density[bin]++;
              }
            }
          }
          
          // Normalize density
          var maxDensity = Math.max.apply(null, density);
          if (maxDensity > 0) {
            for (var bin = 0; bin < bins; bin++) {
              density[bin] /= maxDensity;
            }
          }
          
          // Draw violin shape
          gClassic.fillStyle = colorFor(k / Math.max(1, ls.length-1), C.colorscale, C.opacity);
          gClassic.strokeStyle = C.outline ? (C.bg==="white" ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)") : "transparent";
          gClassic.lineWidth = 1;
          
          gClassic.beginPath();
          // Right side of violin
          for (var bin = 0; bin < bins; bin++) {
            var y = ypix(minY + (bin + 0.5) * binSize, b, H);
            var width = density[bin] * violinWidth * 0.5 * (C.pointSize / 18);
            var x = centerX + width;
            if (bin === 0) gClassic.moveTo(centerX, y);
            else gClassic.lineTo(x, y);
          }
          // Left side of violin (mirror)
          for (var bin = bins - 1; bin >= 0; bin--) {
            var y = ypix(minY + (bin + 0.5) * binSize, b, H);
            var width = density[bin] * violinWidth * 0.5 * (C.pointSize / 18);
            var x = centerX - width;
            gClassic.lineTo(x, y);
          }
          gClassic.closePath();
          gClassic.fill();
          if (C.outline) gClassic.stroke();
          
          // Add median line
          if (C.jitter > 0) {
            var median = categoryData[Math.floor(categoryData.length / 2)];
            var medianY = ypix(median, b, H);
            gClassic.strokeStyle = C.bg==="white" ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)";
            gClassic.lineWidth = 2;
            gClassic.beginPath();
            gClassic.moveTo(centerX - violinWidth * 0.3, medianY);
            gClassic.lineTo(centerX + violinWidth * 0.3, medianY);
            gClassic.stroke();
          }
        }
      }
      legend(gClassic, ls, W, C.bg);
    } else if (C.plotType==="ridge"){
      // Ridge plot (stacked density curves)
      var ls=cats(rows);
      var ridgeHeight = (H - margin.t - margin.b) / Math.max(1, ls.length) * 0.8;
      
      for (var k=0; k<ls.length; k++) {
        var categoryData = [];
        for (var i=0; i<rows.length; i++) {
          var r = rows[i];
          var rc = (r.category==null ? "_" : String(r.category));
          if (rc === ls[k]) categoryData.push(r.x);
        }
        
        if (categoryData.length > 2) {
          categoryData.sort(function(a,b) { return a - b; });
          
          var baseY = margin.t + (k + 1) * ridgeHeight * 1.2;
          var minX = Math.min.apply(null, categoryData);
          var maxX = Math.max.apply(null, categoryData);
          
          // Create smooth density curve using kernel density estimation
          var points = Math.floor(50 + C.gridN * 0.5);
          var bandwidth = (maxX - minX) / 20 * (C.bandwidth / 16);
          
          gClassic.fillStyle = colorFor(k / Math.max(1, ls.length-1), C.colorscale, C.opacity);
          gClassic.strokeStyle = C.outline ? (C.bg==="white" ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)") : "transparent";
          gClassic.lineWidth = 1;
          
          gClassic.beginPath();
          gClassic.moveTo(xpix(minX, b, W), baseY);
          
          for (var p = 0; p <= points; p++) {
            var x = minX + (maxX - minX) * p / points;
            var density = 0;
            
            // Kernel density estimation
            for (var d = 0; d < categoryData.length; d++) {
              var u = (x - categoryData[d]) / bandwidth;
              density += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
            }
            density /= (categoryData.length * bandwidth);
            
            var xp = xpix(x, b, W);
            var yp = baseY - density * ridgeHeight * (C.pointSize / 18) * 100;
            gClassic.lineTo(xp, yp);
          }
          
          gClassic.lineTo(xpix(maxX, b, W), baseY);
          gClassic.closePath();
          gClassic.fill();
          if (C.outline) gClassic.stroke();
          
          // Add category label
          gClassic.fillStyle = C.bg==="white" ? "#333" : "#ccc";
          gClassic.font = "12px sans-serif";
          gClassic.textAlign = "right";
          gClassic.fillText(ls[k], margin.l - 10, baseY - ridgeHeight * 0.3);
        }
      }
    } else if (C.plotType==="hist2d"){
      // 2D Histogram
      var nBinsX = Math.floor(20 + C.gridN * 0.2);
      var nBinsY = Math.floor(20 + C.gridN * 0.2);
      var bins = new Array(nBinsX);
      for (var i = 0; i < nBinsX; i++) {
        bins[i] = new Array(nBinsY);
        for (var j = 0; j < nBinsY; j++) {
          bins[i][j] = 0;
        }
      }
      
      var binWidth = (b.xmax - b.xmin) / nBinsX;
      var binHeight = (b.ymax - b.ymin) / nBinsY;
      
      // Count points in each bin
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var binX = Math.floor((r.x - b.xmin) / binWidth);
        var binY = Math.floor((r.y - b.ymin) / binHeight);
        
        binX = Math.max(0, Math.min(nBinsX - 1, binX));
        binY = Math.max(0, Math.min(nBinsY - 1, binY));
        
        bins[binX][binY]++;
      }
      
      // Find max count for normalization
      var maxCount = 0;
      for (var i = 0; i < nBinsX; i++) {
        for (var j = 0; j < nBinsY; j++) {
          if (bins[i][j] > maxCount) maxCount = bins[i][j];
        }
      }
      
      // Draw 2D histogram
      var cellW = (W - margin.l - margin.r) / nBinsX;
      var cellH = (H - margin.t - margin.b) / nBinsY;
      
      for (var i = 0; i < nBinsX; i++) {
        for (var j = 0; j < nBinsY; j++) {
          if (bins[i][j] > 0) {
            var intensity = bins[i][j] / maxCount;
            var x = margin.l + i * cellW;
            var y = margin.t + j * cellH;
            
            gClassic.fillStyle = colorFor(intensity, C.colorscale, C.opacity * intensity);
            gClassic.fillRect(x, y, cellW, cellH);
            
            if (C.outline && intensity > 0.1) {
              gClassic.strokeStyle = C.bg==="white" ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)";
              gClassic.lineWidth = 0.5;
              gClassic.strokeRect(x, y, cellW, cellH);
            }
          }
        }
      }
    } else if (C.plotType==="streamlines"){
      // Enhanced Streamlines visualization
      gClassic.lineWidth = Math.max(0.3, C.pointSize * 0.15);
      var gridSize = Math.floor(20 + C.gridN * 0.8); // Much higher resolution
      var stepSize = 1.5;
      
      // Create high-resolution vector field
      var field = new Array(gridSize);
      for (var i = 0; i < gridSize; i++) {
        field[i] = new Array(gridSize);
        for (var j = 0; j < gridSize; j++) {
          field[i][j] = { vx: 0, vy: 0, density: 0 };
        }
      }
      
      // Create a base global field pattern to ensure coverage everywhere
      for (var i = 0; i < gridSize; i++) {
        for (var j = 0; j < gridSize; j++) {
          var gx = i / (gridSize - 1);
          var gy = j / (gridSize - 1);
          
          // Base circular flow pattern
          var centerX = 0.5, centerY = 0.5;
          var dx = gx - centerX, dy = gy - centerY;
          var dist = Math.sqrt(dx*dx + dy*dy) + 0.1;
          
          // Tangential component (spiral)
          field[i][j].vx = -dy * 0.8 + dx * 0.2;
          field[i][j].vy = dx * 0.8 + dy * 0.2;
          
          // Add some noise for natural variation
          field[i][j].vx += (Math.sin(gx * 8) * Math.cos(gy * 6)) * 0.3;
          field[i][j].vy += (Math.cos(gx * 6) * Math.sin(gy * 8)) * 0.3;
        }
      }
      
      // Now add data-based influence on top of base field
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var nx = (r.x - b.xmin) / (b.xmax - b.xmin);
        var ny = (r.y - b.ymin) / (b.ymax - b.ymin);
        var gx = Math.floor(nx * (gridSize - 1));
        var gy = Math.floor(ny * (gridSize - 1));
        
        if (gx >= 0 && gx < gridSize && gy >= 0 && gy < gridSize) {
          field[gx][gy].density += 1;
          
          // Enhance flow around data points with wider influence
          var influence_radius = 4;
          for (var di = -influence_radius; di <= influence_radius; di++) {
            for (var dj = -influence_radius; dj <= influence_radius; dj++) {
              var gi = gx + di, gj = gy + dj;
              if (gi >= 0 && gi < gridSize && gj >= 0 && gj < gridSize) {
                var dist = Math.sqrt(di*di + dj*dj) + 0.5;
                var influence = Math.exp(-dist * 0.3) * 0.5;
                
                // Enhance existing field direction
                var angle = Math.atan2(dj, di) + Math.PI/2; // Tangential
                field[gi][gj].vx += Math.cos(angle) * influence;
                field[gi][gj].vy += Math.sin(angle) * influence;
              }
            }
          }
        }
      }
      
      // Smooth and normalize the field
      for (var smooth = 0; smooth < 2; smooth++) {
        for (var i = 1; i < gridSize - 1; i++) {
          for (var j = 1; j < gridSize - 1; j++) {
            var avgVx = (field[i-1][j].vx + field[i+1][j].vx + field[i][j-1].vx + field[i][j+1].vx) / 4;
            var avgVy = (field[i-1][j].vy + field[i+1][j].vy + field[i][j-1].vy + field[i][j+1].vy) / 4;
            field[i][j].vx = field[i][j].vx * 0.7 + avgVx * 0.3;
            field[i][j].vy = field[i][j].vy * 0.7 + avgVy * 0.3;
          }
        }
      }
      
      // Much more streamlines with better distribution
      var baseStreams = Math.floor(30 + C.artDetail * 20); // 30-130 streamlines
      var streamLength = Math.floor(40 + C.artIntensity * 60); // Longer streams
      
      // Multiple starting strategies for comprehensive coverage
      var streamCount = 0;
      
      // Strategy 1: Grid-based starting points for even coverage
      var gridSteps = Math.floor(Math.sqrt(baseStreams * 0.6));
      for (var gx = 0; gx < gridSteps; gx++) {
        for (var gy = 0; gy < gridSteps && streamCount < baseStreams * 0.6; gy++) {
          var startX = margin.l + ((gx + 0.5) / gridSteps) * (W - margin.l - margin.r);
          var startY = margin.t + ((gy + 0.5) / gridSteps) * (H - margin.t - margin.b);
          drawStreamline(startX, startY, streamCount++, baseStreams);
        }
      }
      
      // Strategy 2: Data-point based starting points
      var dataStreams = Math.floor(baseStreams * 0.2);
      for (var i = 0; i < Math.min(dataStreams, rows.length); i += Math.floor(rows.length / dataStreams) || 1) {
        var r = rows[i];
        var px = xpix(r.x, b, W), py = ypix(r.y, b, H);
        // Offset slightly to avoid starting exactly on data points
        var startX = px + (Math.random() - 0.5) * 20;
        var startY = py + (Math.random() - 0.5) * 20;
        drawStreamline(startX, startY, streamCount++, baseStreams);
      }
      
      // Strategy 3: Random starting points for variety
      var randomStreams = baseStreams - streamCount;
      for (var stream = 0; stream < randomStreams; stream++) {
        var startX = margin.l + (Math.random() * (W - margin.l - margin.r));
        var startY = margin.t + (Math.random() * (H - margin.t - margin.b));
        drawStreamline(startX, startY, streamCount++, baseStreams);
      }
      
      function drawStreamline(startX, startY, streamIndex, totalStreams) {
        gClassic.strokeStyle = colorFor(streamIndex / totalStreams, C.colorscale, C.opacity * 0.9);
        gClassic.beginPath();
        
        var x = startX, y = startY;
        gClassic.moveTo(x, y);
        var stagnationCount = 0;
        
        for (var step = 0; step < streamLength; step++) {
          // Get field at current position
          var fx = ((x - margin.l) / (W - margin.l - margin.r)) * (gridSize - 1);
          var fy = ((y - margin.t) / (H - margin.t - margin.b)) * (gridSize - 1);
          
          var gx = Math.floor(fx);
          var gy = Math.floor(fy);
          
          // More generous boundary checking
          if (gx >= 0 && gx < gridSize - 1 && gy >= 0 && gy < gridSize - 1) {
            // Bilinear interpolation for smooth field
            var fx1 = fx - gx;
            var fy1 = fy - gy;
            
            var v00 = field[gx][gy];
            var v10 = field[Math.min(gx+1, gridSize-1)][gy];
            var v01 = field[gx][Math.min(gy+1, gridSize-1)];
            var v11 = field[Math.min(gx+1, gridSize-1)][Math.min(gy+1, gridSize-1)];
            
            var vx = v00.vx * (1-fx1) * (1-fy1) + v10.vx * fx1 * (1-fy1) + 
                     v01.vx * (1-fx1) * fy1 + v11.vx * fx1 * fy1;
            var vy = v00.vy * (1-fx1) * (1-fy1) + v10.vy * fx1 * (1-fy1) + 
                     v01.vy * (1-fx1) * fy1 + v11.vy * fx1 * fy1;
            
            // Ensure minimum field strength to avoid stagnation
            var fieldStrength = Math.sqrt(vx*vx + vy*vy);
            if (fieldStrength < 0.1) {
              // Add some random motion when field is weak
              vx += (Math.random() - 0.5) * 0.2;
              vy += (Math.random() - 0.5) * 0.2;
              stagnationCount++;
              if (stagnationCount > 5) break; // Avoid infinite loops
            } else {
              stagnationCount = 0;
            }
            
            // Consistent step size
            var stepScale = stepSize * (C.pointSize / 18) * 4;
            var newX = x + vx * stepScale;
            var newY = y + vy * stepScale;
            
            // Boundary reflection instead of termination
            if (newX < margin.l || newX > W - margin.r) {
              vx = -vx; // Reflect X velocity
            }
            if (newY < margin.t || newY > H - margin.b) {
              vy = -vy; // Reflect Y velocity
            }
            
            x = Math.max(margin.l, Math.min(W - margin.r, newX));
            y = Math.max(margin.t, Math.min(H - margin.b, newY));
            
            gClassic.lineTo(x, y);
          } else {
            // If outside grid, use boundary reflection to continue
            if (x < margin.l + 10) x = margin.l + 10;
            if (x > W - margin.r - 10) x = W - margin.r - 10;
            if (y < margin.t + 10) y = margin.t + 10;
            if (y > H - margin.b - 10) y = H - margin.b - 10;
            gClassic.lineTo(x, y);
          }
        }
        gClassic.stroke();
      }
    } else if (C.plotType==="contour"){
      // Scientific contour plot
      var GN = Math.floor(30 + C.gridN * 0.3);
      var sigma = Math.max(1, C.bandwidth * 0.5);
      var grid = new Float32Array(GN * GN);
      
      // Build density grid
      function splat(px, py) {
        var r = Math.max(1, Math.floor(3 * sigma));
        var x0 = Math.max(0, px - r), x1 = Math.min(GN - 1, px + r);
        var y0 = Math.max(0, py - r), y1 = Math.min(GN - 1, py + r);
        var two = 2 * sigma * sigma;
        
        for (var yy = y0; yy <= y1; yy++) {
          for (var xx = x0; xx <= x1; xx++) {
            var dx = xx - px, dy = yy - py;
            grid[yy * GN + xx] += Math.exp(-(dx * dx + dy * dy) / two);
          }
        }
      }
      
      for (var i = 0; i < rows.length; i++) {
        var u = (rows[i].x - b.xmin) / (b.xmax - b.xmin + 1e-9);
        var v = (rows[i].y - b.ymin) / (b.ymax - b.ymin + 1e-9);
        var gx = Math.floor(u * (GN - 1));
        var gy = Math.floor((1 - v) * (GN - 1));
        if (isFinite(gx) && isFinite(gy)) splat(gx, gy);
      }
      
      // Normalize
      var mx = 0;
      for (i = 0; i < grid.length; i++) if (grid[i] > mx) mx = grid[i];
      if (mx > 0) for (i = 0; i < grid.length; i++) grid[i] /= mx;
      
      // Draw contour lines using marching squares
      gClassic.lineWidth = Math.max(0.5, C.pointSize * 0.15);
      
      for (var level = 1; level <= C.levels; level++) {
        var threshold = level / (C.levels + 1);
        gClassic.strokeStyle = colorFor(threshold, C.colorscale, C.opacity);
        gClassic.beginPath();
        
        for (var y = 0; y < GN - 1; y++) {
          for (var x = 0; x < GN - 1; x++) {
            var v1 = grid[y * GN + x];
            var v2 = grid[y * GN + x + 1];
            var v3 = grid[(y + 1) * GN + x + 1];
            var v4 = grid[(y + 1) * GN + x];
            
            // Marching squares configuration
            var config = 0;
            if (v1 > threshold) config |= 1;
            if (v2 > threshold) config |= 2;
            if (v3 > threshold) config |= 4;
            if (v4 > threshold) config |= 8;
            
            if (config > 0 && config < 15) {
              var x1 = margin.l + (x / (GN - 1)) * (W - margin.l - margin.r);
              var y1 = margin.t + (y / (GN - 1)) * (H - margin.t - margin.b);
              var x2 = margin.l + ((x + 1) / (GN - 1)) * (W - margin.l - margin.r);
              var y2 = margin.t + ((y + 1) / (GN - 1)) * (H - margin.t - margin.b);
              
              var midX = (x1 + x2) / 2;
              var midY = (y1 + y2) / 2;
              
              // Draw line segments based on configuration
              switch (config) {
                case 1: case 14:
                  gClassic.moveTo(x1, midY); gClassic.lineTo(midX, y1);
                  break;
                case 2: case 13:
                  gClassic.moveTo(midX, y1); gClassic.lineTo(x2, midY);
                  break;
                case 3: case 12:
                  gClassic.moveTo(x1, midY); gClassic.lineTo(x2, midY);
                  break;
                case 4: case 11:
                  gClassic.moveTo(x2, midY); gClassic.lineTo(midX, y2);
                  break;
                case 6: case 9:
                  gClassic.moveTo(midX, y1); gClassic.lineTo(midX, y2);
                  break;
                case 7: case 8:
                  gClassic.moveTo(x1, midY); gClassic.lineTo(midX, y2);
                  break;
              }
            }
          }
        }
        gClassic.stroke();
      }
      
      // Optionally show data points
      if (C.jitter > 0) {
        gClassic.fillStyle = C.bg === "white" ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var xp = xpix(r.x, b, W);
          var yp = ypix(r.y, b, H);
          gClassic.beginPath();
          gClassic.arc(xp, yp, C.pointSize * 0.3, 0, 6.283);
          gClassic.fill();
        }
      }
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
    var b=getOptimizedBounds(C.plotType, C.equal); artClear(C.bg); gArt.globalCompositeOperation=C.blend;
    
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
    var s = cssSize();
    var b=getOptimizedBounds(C.plotType, C.equal);
    artClear(C.bg); gArt.globalCompositeOperation=C.blend;
    
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
    var s = cssSize();
    var b=getOptimizedBounds(C.plotType, C.equal);
    artClear(C.bg); gArt.globalCompositeOperation=C.blend;
    
    var canvasW = s.w - margin.l - margin.r;
    var canvasH = s.h - margin.t - margin.b;
    
    // Scale movement based on canvas size to ensure ribbons stay contained
    var scaleX = canvasW / Math.max(canvasW, canvasH) * 0.8;
    var scaleY = canvasH / Math.max(canvasW, canvasH) * 0.8;
    
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
        
        // Scale movement to canvas size and apply containment
        var speed = (1 + 3 * C.artIntensity) * Math.min(scaleX, scaleY);
        var deltaX = nx * speed * 2; // Reduced from 4 to 2
        var deltaY = ny * speed * 2;
        
        // Bounce off boundaries instead of clamping
        var nextX = px + deltaX;
        var nextY = py + deltaY;
        
        if (nextX < margin.l || nextX > s.w - margin.r) {
          deltaX = -deltaX; // Reverse direction
        }
        if (nextY < margin.t || nextY > s.h - margin.b) {
          deltaY = -deltaY; // Reverse direction
        }
        
        px += deltaX;
        py += deltaY;
        
        // Final safety clamp (should rarely trigger now)
        px = Math.max(margin.l + 5, Math.min(s.w - margin.r - 5, px));
        py = Math.max(margin.t + 5, Math.min(s.h - margin.b - 5, py));
        
        gArt.lineTo(px, py);
      }
      gArt.stroke();
    }
  }
  function artMetaballs(){
    var C=cfg(), allRows=P.rows, s=cssSize(); if (!allRows.length) return;
    var rows=filterData(allRows, C); if (!rows.length) return;
    var b=getOptimizedBounds(C.plotType, C.equal);
    artClear(C.bg); 
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
    var b = getOptimizedBounds(C.plotType, C.equal);
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
    var b = getOptimizedBounds(C.plotType, C.equal);
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
    var b = getOptimizedBounds(C.plotType, C.equal);
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
      "bubble": ["basic-sliders", "jitter-sliders"],
      "connected": ["basic-sliders", "jitter-sliders"],
      "violin": ["basic-sliders", "grid-sliders"],
      "hexbin": ["basic-sliders", "grid-sliders"],
      "surface3d": ["basic-sliders", "grid-sliders"],
      "ridge": ["basic-sliders", "grid-sliders"],
      "hist": ["basic-sliders"],
      "hist2d": ["basic-sliders", "grid-sliders"],
      "density": ["basic-sliders", "grid-sliders"],
      "contour": ["basic-sliders", "grid-sliders"],
      "streamlines": ["basic-sliders", "grid-sliders"],
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

  // ---------- Pre-calculate visualization bounds ----------
  function preCalculateVisualizationBounds() {
    if (!P.rows || P.rows.length === 0) return;
    
    var baseBounds = bounds(P.rows, false); // Get basic data bounds without equal scaling
    var s = cssSize();
    
    // Define how each visualization type extends beyond base data
    var visualizationExtents = {
      // Standard plots stay close to data
      "scatter": { expand: 0.05 },
      "bubble": { expand: 0.1 },
      "connected": { expand: 0.05 },
      "poincare": { expand: 0.05 },
      "poincare-ellipse": { expand: 0.15 },
      "violin": { expand: 0.2 },
      "ridge": { expand: 0.2 },
      "hist": { expand: 0.1 },
      "hist2d": { expand: 0.05 },
      "hexbin": { expand: 0.1 },
      
      // Scientific plots can extend moderately
      "surface3d": { expand: 0.3 },
      "density": { expand: 0.2 },
      "contour": { expand: 0.25 },
      "streamlines": { expand: 0.4 },
      
      // Art visualizations extend significantly
      "art-pointillism": { expand: 0.2 },
      "art-ink": { expand: 0.5 },
      "art-flow": { expand: 0.6 },
      "art-metaballs": { expand: 0.4 },
      "art-contours": { expand: 0.3 },
      "art-halftone": { expand: 0.15 },
      "art-rd": { expand: 0.8 }
    };
    
    // Pre-calculate bounds for each visualization type
    visualizationBounds = {};
    Object.keys(visualizationExtents).forEach(plotType => {
      var extent = visualizationExtents[plotType];
      var dataW = baseBounds.xmax - baseBounds.xmin;
      var dataH = baseBounds.ymax - baseBounds.ymin;
      
      var expandX = Math.max(dataW * extent.expand, 50); // Minimum 50px expansion
      var expandY = Math.max(dataH * extent.expand, 50);
      
      visualizationBounds[plotType] = {
        xmin: baseBounds.xmin - expandX,
        xmax: baseBounds.xmax + expandX,
        ymin: baseBounds.ymin - expandY,
        ymax: baseBounds.ymax + expandY
      };
    });
  }
  
  // ---------- Get optimized bounds for current plot type ----------
  function getOptimizedBounds(plotType, equalScaling) {
    // Use pre-calculated bounds if available
    if (visualizationBounds[plotType]) {
      var bounds = visualizationBounds[plotType];
      
      if (equalScaling) {
        var minVal = Math.min(bounds.xmin, bounds.ymin);
        var maxVal = Math.max(bounds.xmax, bounds.ymax);
        return { xmin: minVal, xmax: maxVal, ymin: minVal, ymax: maxVal };
      }
      
      return bounds;
    }
    
    // Fallback to original bounds calculation
    return bounds(P.rows, equalScaling);
  }

  // ---------- Art visualization bounds adjustment ----------
  function adjustBoundsForArt(originalBounds, plotType, canvasSize) {
    // Art visualizations that typically extend beyond data bounds
    var expandingArtTypes = ["art-flow", "art-ink", "art-metaballs", "art-rd"];
    
    if (!expandingArtTypes.includes(plotType)) {
      return originalBounds;
    }
    
    // Calculate expansion factor based on canvas size
    var canvasW = canvasSize.w - margin.l - margin.r;
    var canvasH = canvasSize.h - margin.t - margin.b;
    var dataW = originalBounds.xmax - originalBounds.xmin;
    var dataH = originalBounds.ymax - originalBounds.ymin;
    
    // Expand bounds to ensure art effects stay visible
    var expandX = Math.max(dataW * 0.3, canvasW * 0.1 / zoomState.level);
    var expandY = Math.max(dataH * 0.3, canvasH * 0.1 / zoomState.level);
    
    return {
      xmin: originalBounds.xmin - expandX,
      xmax: originalBounds.xmax + expandX,
      ymin: originalBounds.ymin - expandY,
      ymax: originalBounds.ymax + expandY
    };
  }

  // ---------- Point size range control ----------
  function updatePointSizeRange() {
    var plotType = $("#plotType").value;
    var pointSizeSlider = $("#pointSize");
    
    // Plot types that need 3x point size range
    var highRangePlots = ["contour", "art-contours", "art-halftone", "art-rd", "streamlines"];
    
    if (highRangePlots.includes(plotType)) {
      pointSizeSlider.max = "54";  // 3x the original 18
    } else {
      pointSizeSlider.max = "18";  // Original range
    }
    
    // Ensure current value doesn't exceed new max
    var currentValue = parseInt(pointSizeSlider.value);
    var newMax = parseInt(pointSizeSlider.max);
    if (currentValue > newMax) {
      pointSizeSlider.value = newMax;
    }
  }

  // ---------- Main control flow ----------
  function render() {
    var C = cfg();
    updateSliderVisibility();
    updatePointSizeRange();
    
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
    
    // Pre-calculate optimal bounds for all visualization types
    preCalculateVisualizationBounds();
    
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
      for (var i = 0; i < 300; i++) {
        // Create multiple interesting patterns
        var t = i / 50;
        var x, y, cat;
        
        if (i < 100) {
          // Spiral pattern
          var ang = t * 3;
          var r = t * 2;
          x = r * Math.cos(ang) + (Math.random() - 0.5) * 0.5;
          y = r * Math.sin(ang) + (Math.random() - 0.5) * 0.5;
          cat = "Spiral";
        } else if (i < 200) {
          // Lissajous curve
          x = 8 * Math.sin(t * 2 + Math.PI/4) + (Math.random() - 0.5) * 0.8;
          y = 6 * Math.sin(t * 3) + (Math.random() - 0.5) * 0.8;
          cat = "Lissajous";
        } else {
          // Strange attractor-like
          var a = 1.4, b = 0.3;
          x = Math.sin(a * t) - Math.cos(b * t) * 5 + (Math.random() - 0.5) * 0.3;
          y = Math.sin(b * t) + Math.cos(a * t) * 3 + (Math.random() - 0.5) * 0.3;
          cat = "Attractor";
        }
        
        sample += `${x.toFixed(4)},${y.toFixed(4)},${cat}\n`;
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
      
      // Recalculate bounds for new Poincaré data
      preCalculateVisualizationBounds();
      
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
    
    // Zoom controls
    $("#zoomIn").addEventListener("click", () => {
      zoomState.level = Math.min(5.0, zoomState.level * 1.3);
      $("#zoomLevel").value = Math.round(zoomState.level * 100);
      updatePills();
      render();
    });
    $("#zoomOut").addEventListener("click", () => {
      zoomState.level = Math.max(0.1, zoomState.level / 1.3);
      $("#zoomLevel").value = Math.round(zoomState.level * 100);
      updatePills();
      render();
    });
    $("#resetZoom").addEventListener("click", () => {
      zoomState.level = 1.0;
      zoomState.centerX = 0;
      zoomState.centerY = 0;
      $("#zoomLevel").value = 100;
      updatePills();
      render();
    });
    $("#centerView").addEventListener("click", () => {
      zoomState.centerX = 0;
      zoomState.centerY = 0;
      updatePills();
      render();
    });
    $("#zoomLevel").addEventListener("input", () => {
      zoomState.level = parseFloat($("#zoomLevel").value) / 100.0;
      updatePills();
      render();
    });
    
    // Print preparation controls
    $("#centerForPrint").addEventListener("click", () => {
      if (!P.rows || P.rows.length === 0) {
        alert("Load data first to center for print.");
        return;
      }
      
      // Calculate data centroid (visual center of mass)
      var sumX = 0, sumY = 0;
      for (var i = 0; i < P.rows.length; i++) {
        sumX += P.rows[i].x || 0;
        sumY += P.rows[i].y || 0;
      }
      var centroidX = sumX / P.rows.length;
      var centroidY = sumY / P.rows.length;
      
      // Center on the data centroid
      zoomState.centerX = -centroidX;
      zoomState.centerY = -centroidY;
      
      updatePills();
      render();
    });
    
    $("#fitToPrint").addEventListener("click", () => {
      if (!P.rows || P.rows.length === 0) {
        alert("Load data first to fit for print.");
        return;
      }
      
      // First center the data
      var sumX = 0, sumY = 0;
      for (var i = 0; i < P.rows.length; i++) {
        sumX += P.rows[i].x || 0;
        sumY += P.rows[i].y || 0;
      }
      var centroidX = sumX / P.rows.length;
      var centroidY = sumY / P.rows.length;
      
      // Calculate data bounds
      var xs = P.rows.map(r => r.x || 0);
      var ys = P.rows.map(r => r.y || 0);
      var dataWidth = Math.max(...xs) - Math.min(...xs);
      var dataHeight = Math.max(...ys) - Math.min(...ys);
      
      // Get canvas dimensions
      var s = cssSize();
      var printWidth = s.w - margin.l - margin.r;
      var printHeight = s.h - margin.t - margin.b;
      
      // Calculate zoom to fit data within print area (with margin)
      var C = cfg();
      var isArtVisualization = C.plotType.startsWith('art-');
      
      // Use more conservative margins for art visualizations that can extend beyond data bounds
      var margin_factor = isArtVisualization ? 0.7 : 0.9;
      var zoomX = (printWidth * margin_factor) / (dataWidth || 1);
      var zoomY = (printHeight * margin_factor) / (dataHeight || 1);
      var optimalZoom = Math.min(zoomX, zoomY);
      
      // Cap zoom for art visualizations to prevent overflow
      if (isArtVisualization) {
        optimalZoom = Math.min(optimalZoom, 2.0);
      }
      
      // Apply centering and zoom
      zoomState.centerX = -centroidX;
      zoomState.centerY = -centroidY;
      zoomState.level = Math.min(5.0, Math.max(0.1, optimalZoom));
      
      $("#zoomLevel").value = Math.round(zoomState.level * 100);
      updatePills();
      render();
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
  updatePointSizeRange();
  render();
})();