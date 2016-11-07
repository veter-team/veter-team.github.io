"use strict"

b4w.register("veterbot", function(exports, require) {
var m_app       = require("app");
var m_data      = require("data");
var m_anim      = require("animation");
var m_scenes    = require("scenes");
var m_objects   = require("objects");
var m_mat       = require("material");
var m_tex       = require("textures");
var m_cfg       = require("config");
var m_trans     = require("transform");
var m_lights    = require("lights");
var m_main      = require("main");
var m_geom      = require("geometry");
//var m_ctl       = require("controls");
var m_cons      = require("constraints");

var vec3        = require("vec3");
var quat        = require("quat");
var mm          = require("mat4");
var tsr         = require("tsr");


var m_client = null;

//20160712

var vRobot;
var vCockpit;

function pos(x,y,z){return {x:x,y:y,z:z};}
function limit(v,a,b){return v<a?a:(v>b?b:v);}
function limita(v,a){return limit(v,-a,a);}
function dist(x0,y0,x1,y1){var dx=(x0-x1);var dy=(y0-y1);return Math.sqrt(dx*dx+dy*dy);}
function slide(v,a){return v>a?v-a:(v<0?v+a:v);}

function isUndefined(a){return a==undefined;}
function isDefined(a){return !isUndefined(a);}

function appendKeys(dest,sour){if(isDefined(sour))for(var key in sour)dest[key]=sour[key];return dest;}
function appendItems(dest,sour){if(isDefined(sour))for(var i=0;i<sour.length;i++)dest.push(sour[i]);return dest;}


var logic=function(){
    var sensors={};

    function eventKey(e){
        if(isUndefined(e))e=window.event;
        if(isDefined(sensors[e.type])){
            var keys = ['anykey',e.which];
            for(var i in [0,1]){
                var subsensor=sensors[e.type][keys[i]];
                if(isDefined(subsensor)){
                    for(var j=0;j<subsensor.length;j++){
                        var sensor=subsensor[j];
                        if(isDefined(sensor.cb))sensor.cb(e,sensor);
                    }
                }
            }
        }
    }

    function eventMouse(e){
    }

    function addSensor(params,func){
        for(var p in params){
            var sensor=params[p];
            if(p=='keyboard'){
                sensor.cb=func;
                if(isDefined(sensor.key))sensor.keys=[sensor.key];
                if(isUndefined(sensor.keys))sensor.keys=['anykey'];
                if(isDefined(sensor.type))sensor.types=[sensor.type];
                if(isUndefined(sensor.types))sensor.types=['keydown'];
                for(var j=0;j<sensor.types.length;j++){
                    var type=sensor.types[j];
                    window['on'+type]=eventKey;
                    if(isUndefined(sensors[type]))sensors[type]={};
                    for(var i=0;i<sensor.keys.length;i++){
                        var key=sensor.keys[i];
                        if(isUndefined(sensors[type][key]))sensors[type][key]=[];
                        sensors[type][key].push(sensor);
                    }
                }
            }
        }
    }
    return {addSensor:addSensor};
}();
    

var exchange=function(){
    var n=0;
    var storage={};
    function put(key,msg){storage[key]=msg; console.log(key,msg);}
    function get(key){var msg=storage[key];storage[key]=undefined;return msg;}
    return {put:put,get:get,storage:storage}
}();

function F2B(f){return (f*127+127)|0;}
function B2F(b){return (b-127)/127;}

var vCockpitInit=function(){
    var lastkey=0;
    var idata={};
    var triggers={FORWARD:false,BACK:false,LEFT:false,RIGHT:false};
    var toggles={WHEELCHANGE:false,RELOAD:false,ROTATE:false,COLOR:false};

    function update(){
        appendKeys(idata,exchange.get('to-cockpit'));

        var powerL=limita((triggers.FORWARD?1:0)-(triggers.BACK?1:0)-(triggers.RIGHT?1:0)+(triggers.LEFT?1:0),1);
        var powerR=limita((triggers.FORWARD?1:0)-(triggers.BACK?1:0)+(triggers.RIGHT?1:0)-(triggers.LEFT?1:0),1);
        var cmd={powerL:F2B(powerL),powerR:F2B(powerR)};

        for(var key in toggles) if(toggles[key]){cmd[key]=true;toggles[key]=false;}
        exchange.put('to-robot',cmd);
    }
    
    logic.addSensor({keyboard:{types:['keydown','keyup'],keys:[87,38]}},function(e){triggers.FORWARD=e.type=='keydown';});
    logic.addSensor({keyboard:{types:['keydown','keyup'],keys:[83,40]}},function(e){triggers.BACK=e.type=='keydown';});
    logic.addSensor({keyboard:{types:['keydown','keyup'],keys:[65,37]}},function(e){triggers.LEFT=e.type=='keydown';});
    logic.addSensor({keyboard:{types:['keydown','keyup'],keys:[68,39]}},function(e){triggers.RIGHT=e.type=='keydown';});

    logic.addSensor({keyboard:{type:'keydown',key:84}},function(e){toggles.WHEELCHANGE=true;});
    logic.addSensor({keyboard:{type:'keydown',key:67}},function(e){toggles.COLOR=true;});
    logic.addSensor({keyboard:{type:'keydown',key:82}},function(e){toggles.ROTATE=true;});

    return {update:update};
}


var SysCurrent={smat:tsr.create(),dmat:tsr.create()};
var SysTSRStack=[[tsr.create(),SysCurrent]];
var SysScale=0.01;
var SysTime=new Date();
var SysDTime=0;
var SysMTime=SysTime;

function b4w_SetObj(obj){SysCurrent=obj;}
function b4w_GetObj(){return SysCurrent;}

function b4w_GetForm(name){return m_scenes.get_object_by_name(name);}

function b4w_AddObj(name,form_name){
    var obj={name:name,smat:tsr.create(),dmat:tsr.create(),time:SysTime,life:-1};
    if(isDefined(name)&&isDefined(form_name)){
        var form=b4w_GetForm(form_name);
        if(name!=form_name){
            obj.form=m_objects.copy(form,name,false);
            m_scenes.append_object(obj.form);
        }else{
            obj.form=form;
        }
    }
    b4w_SetObj(obj);
    return b4w_GetObj();
}

function b4w_RemoveObj(){
    if(isDefined(SysCurrent.form))m_scenes.remove_object(SysCurrent.form);
    SysCurrent=undefined;
}

function b4w_GetQuat(){return quat.fromValues(SysCurrent.dmat[4],SysCurrent.dmat[5],SysCurrent.dmat[6],SysCurrent.dmat[7]);}
function b4w_RotateX(rad){var q=b4w_GetQuat();quat.rotateX(q,rad,q);tsr.set_quat(q,SysCurrent.dmat);}
function b4w_RotateY(rad){var q=b4w_GetQuat();quat.rotateY(q,rad,q);tsr.set_quat(q,SysCurrent.dmat);}
function b4w_RotateZ(rad){var q=b4w_GetQuat();quat.rotateZ(q,rad,q);tsr.set_quat(q,SysCurrent.dmat);}

function b4w_Move(x,y,z){tsr.set_trans([x*SysScale,y*SysScale,z*SysScale],SysCurrent.dmat);}
function b4w_SetX(v){SysCurrent.dmat[0]=v*SysScale;}
function b4w_SetY(v){SysCurrent.dmat[1]=v*SysScale;}
function b4w_SetZ(v){SysCurrent.dmat[2]=v*SysScale;}

function b4w_Scale(f){tsr.set_scale(f,SysCurrent.dmat);}


function b4w_GetState(){
    var t=tsr.create();
    tsr.multiply(SysCurrent.smat,SysCurrent.dmat,t);
    tsr.multiply(SysTSRStack[0][0],t,t);
    return t;
}

function b4w_SetState(state){
    tsr.copy(state,SysCurrent.dmat);
}

function b4w_StatePush(){var t=b4w_GetState(SysCurrent);SysTSRStack.unshift([t,SysCurrent]);}
function b4w_StatePop(){var t=SysTSRStack.shift();SysCurrent=t[1];}

function b4w_BakeObj(){
    tsr.multiply(SysCurrent.smat,SysCurrent.dmat,SysCurrent.smat);
    tsr.identity(SysCurrent.dmat);
}

function b4w_SetLife(life){SysCurrent.life=life;}
function b4w_isExpired(){return (SysCurrent.life>0 && SysTime-SysCurrent.time>SysCurrent.life);}

function b4w_UpdateObj(){
    var t=b4w_GetState();
    if(isDefined(SysCurrent.form)) m_trans.set_tsr(SysCurrent.form,t);
    tsr.identity(SysCurrent.dmat);
    return SysCurrent;
}

var vRobotInit=function(){
    const INSTALL=0;
    const DEINSTALL=1;
    const UPDATE=2;

    function makeOb(tag,param,sparam){
        var ob={tag:tag,mods:{},gobs:[]};
        appendKeys(ob,param);
        appendKeys(ob,sparam);
        ob.suborder=function(type){
            for(var key in ob.mods){
                ob.mods[key].order(type);
            }
        }
        ob.order=function(type){ob.suborder(type);}
        return ob;
    }

    function setupMod(ob,mod){
        var tag=mod.tag;
        
        if(isDefined(ob.mods[tag])){
            ob.mods[tag].order(DEINSTALL);
            ob.mods[tag].parent=undefined;
            ob.mods[tag]=undefined;
        }
        ob.mods[tag]=mod;
        mod.parent=ob;
        mod.order(INSTALL);
    }

    function updateMod(mod){
        if(isDefined(mod))mod.order(UPDATE);
    }

    var modChassis=function(param){
        var ob=makeOb('chassis',param,{A:[0,0],D:[0,0],W:0,P:pos(0,0,0)});
        ob.order=function(type){
            switch(type){
            case INSTALL:
                ob.gobs=b4w_AddObj();
                ob.suborder(type);
                break;
            case DEINSTALL:
                b4w_SetObj(ob.gobs);
                b4w_RemoveObj();
                ob.suborder(type);
                break;
            case UPDATE:
                var Speed=ob.parent.mods.motors.Speed;
                var R=ob.mods.wheels.R;
                ob.P.y=R;
                var dv=2*Math.PI*SysDTime*R;
                ob.D=[dv*Speed[0],dv*Speed[1]];
                var a=(ob.D[0]-ob.D[1])/(2*ob.B);
                if(a!=0){
                    var r=(ob.D[0]+ob.D[1])/(2*a);
                    var rd=Math.abs(r)+ob.B;
                    ob.P.x-=r*Math.cos(ob.W);
                    ob.P.z+=r*Math.sin(ob.W);
                    ob.W=slide(ob.W-a/Math.sqrt(rd*rd+ob.T*ob.T)*rd,2*Math.PI);
                    ob.P.x+=r*Math.cos(ob.W);
                    ob.P.z-=r*Math.sin(ob.W);
                }else{
                    ob.P.x+=ob.D[0]*Math.sin(ob.W);
                    ob.P.z+=ob.D[1]*Math.cos(ob.W);
                }
                ob.A[0]+=ob.D[0]/R;
                ob.A[1]+=ob.D[1]/R;
                b4w_SetObj(ob.gobs);
                b4w_Move(ob.P.x,ob.P.y,-ob.P.z);
                b4w_RotateY(-ob.W);           
                b4w_StatePush();
                ob.suborder(type);
                b4w_StatePop();
                b4w_UpdateObj();
                break;
            }
        }
        return ob;
    }

    var modCarcass=function(param){
        var ob=makeOb('carcass',param);
        ob.order=function(type){
            switch(type){
            case INSTALL:
                ob.gobs=b4w_AddObj('carcass',ob.Form);
                break;
            case DEINSTALL:
                b4w_SetObj(ob.gobs);
                b4w_RemoveObj();
                break;
            case UPDATE:
                b4w_SetObj(ob.gobs);
                b4w_UpdateObj();
                break;
            }
        }
        return ob;
    }
        
    var modWheels=function(param){
        var ob=makeOb('wheels',param);

        ob.order=function(type){
            switch(type){
            case INSTALL:
                var B=ob.parent.B+ob.Bw;
                var T=ob.parent.T;
                var R=ob.R;
                ob.Wheels=[{P:pos(B,0,T),A:0},{P:pos(-B,0,T),A:1},{P:pos(B,0,-T),A:0},{P:pos(-B,0,-T),A:1}];
                for(var i=0;i<ob.Wheels.length;i++){
                    ob.gobs[i]=b4w_AddObj('wheels'+i,ob.Form);
                    b4w_Move(ob.Wheels[i].P.x,ob.Wheels[i].P.y,ob.Wheels[i].P.z);
                    b4w_RotateY(Math.PI*ob.Wheels[i].A);
                    b4w_BakeObj();
                }
                break;
            case DEINSTALL:
                for(var i=0;i<ob.Wheels.length;i++){
                    b4w_SetObj(ob.gobs[i]);
                    b4w_RemoveObj();
                }
                break;
            case UPDATE:
                var A=ob.parent.A;
                var W=ob.parent.W;
                var sA=[-A[0],A[1],-A[0],A[1]];
                for(var i=0;i<ob.Wheels.length;i++){
                    b4w_SetObj(ob.gobs[i]);
                    b4w_RotateX(sA[i]);               
                    b4w_UpdateObj();                
                }
                break;
            }
        }
        return ob;
    }

    var modTracks=function(param){
        var ob=makeOb('tracks',param,{Tracks:[],Offset:[0,0],Speed:[0,0]});
        ob.order=function(type){
            switch(type){
            case INSTALL:
                ob.R=ob.parent.mods.wheels.R;
                ob.T=ob.parent.T;
                ob.B=ob.parent.B+ob.parent.mods.wheels.Bw;;
                
                ob.L=2*Math.PI*ob.R+4*ob.T;
                ob.Count=(ob.L/ob.Width)|0;
                for(var i=0;i<ob.Count*2;i++){
                    ob.Tracks[i]={down:false,toch:false,P:pos(0,0,0),W:0};
                    ob.gobs[i]=b4w_AddObj('track'+i,ob.Form);
                }
                break;
            case DEINSTALL:
                for(var i=0;i<ob.gobs.length;i++){
                    b4w_SetObj(ob.gobs[i]);
                    b4w_RemoveObj();
                }
                break;
            case UPDATE:
                var W=ob.parent.W;
                var D=ob.parent.D;
                var dlen=ob.L/ob.Count;
                var s=[2*ob.T,ob.L/2,ob.L/2+2*ob.T];
                var b=[ob.B,-ob.B];
                for(var j=0;j<2;j++){
                    ob.Offset[j]=slide(ob.Offset[j]+D[j],ob.L);
                    ob.Speed[j]=D[j]/SysDTime;
                    var tl=ob.L-ob.Offset[j];
                    for(var i=0;i<ob.Count;i++){
                        var id=ob.Count*j+i;
                        var sl=(i*dlen+tl)%ob.L;
                        var qt=-ob.T;
                        var qa=-Math.PI/2;
                        var down=false;
                        var toch=false;
                        if(sl<s[0]){qt+=sl;down=true;}
                        else if(sl<s[1]){qt+=s[0];qa+=(sl-s[0])/ob.R;}
                        else if(sl<s[2]){qt+=s[0]-(sl-s[1]);qa+=Math.PI;}
                        else qa+=(sl-s[2])/ob.R+Math.PI;
                        var z=-(ob.R*Math.cos(qa)+qt);
                        var y=ob.R*Math.sin(qa);
                        var x=b[j];
                        b4w_SetObj(ob.gobs[id]);
                        b4w_Move(x,y,z);
                        b4w_RotateX(qa-Math.PI/2);
                        var state=b4w_GetState();               
                        var toch=(!down & ob.Tracks[id].down)?0:1;
                        b4w_UpdateObj();
                        ob.Tracks[id]={down:down,toch:toch,state:state,W:-W};
                    }
                }
                break;
            }
        }
        return ob;
    }


    var modTracks2=function(param){
        var ob=makeOb('tracks',param,{Tracks:[],Offset:[0,0,0,0],Speed:[0,0,0,0]});
        ob.order=function(type){
            switch(type){
            case INSTALL:
                ob.R=ob.parent.mods.wheels.R;
                ob.T=ob.parent.T;
                ob.B=ob.parent.B+ob.parent.mods.wheels.Bw;;
                ob.L=2*Math.PI*ob.R;
                ob.Count=(ob.L/ob.Width)|0;
                for(var j=0;j<4;j++){
                    for(var i=0;i<ob.Count;i++){
                        var id=ob.Count*j+i;
                        ob.Tracks[id]={toch:-1,status:type,W:0,state:tsr.create()};
                        ob.gobs[id]=b4w_AddObj('track'+id,ob.Form);
                    }
                }
                break;
            case DEINSTALL:
                for(var i=0;i<ob.gobs.length;i++){
                    b4w_SetObj(ob.gobs[i]);
                    b4w_RemoveObj();
                }
                break;
            case UPDATE:
                var W=ob.parent.W;
                var D=ob.parent.D;
                D=[D[0],D[1],D[0],D[1]];
                var dlen=ob.L/ob.Count;
                var Ts=[ob.T,ob.T,-ob.T,-ob.T];
                var Bs=[ob.B,-ob.B,ob.B,-ob.B];
                for(var j=0;j<4;j++){
                    ob.Offset[j]=slide(ob.Offset[j]+D[j],ob.L);
                    ob.Speed[j]=D[j]/SysDTime;
                    var tl=ob.L-ob.Offset[j];
                    for(var i=0;i<ob.Count;i++){
                        var id=ob.Count*j+i;
                        var sl=(i*dlen+tl)%ob.L;
                        var qa=sl/ob.R;
                        var x=Bs[j];
                        var y=ob.R*Math.sin(qa);
                        var z=Ts[j]-ob.R*Math.cos(qa);
                        
                        b4w_SetObj(ob.gobs[id]);
                        b4w_Move(x,y,z);
                        b4w_RotateX(Math.PI);
                        var state=b4w_GetState();               

                        var toch=-1;
                        if(ob.Tracks[id].state[1]>state[1])toch=1;
                        if(ob.Tracks[id].state[1]<state[1] && ob.Tracks[id].toch==1)toch=0;                      
                        b4w_UpdateObj();
                        
                        ob.Tracks[id]={toch:toch,status:type,state:state,W:-W};
                    }
                }
                break;
            }
        }
        return ob;
    }

    var modTraces=function(param){
        var ob=makeOb('traces',param,{Count:250,Offset:0,traces:[]});
        ob.order=function(type){
            switch(type){
            case INSTALL:
                break;
            case DEINSTALL:
                for(var i=0;i<ob.gobs.length;i++){
                    b4w_SetObj(ob.gobs[i]);
                    b4w_RemoveObj();
                }
                break;
            case UPDATE:
                var ot=ob.parent.mods.chassis.mods.tracks;
                for(var i=0;i<ot.Tracks.length;i++){
                    var track=ot.Tracks[i];
                    if(isDefined(track)){
                        if(isDefined(track.state)){
                            if(track.toch==0){
                                track.toch=-1;
                                if(ob.traces.length>=ob.Count){
                                    b4w_SetObj(ob.traces[0]);
                                    b4w_RemoveObj();
                                    ob.traces.shift();
                                }
                                ob.Offset++;
                                b4w_AddObj('trace'+ob.Offset,ob.Form);
                                b4w_SetState(track.state);
                                b4w_SetY(0);
                                b4w_BakeObj();
                                ob.traces.push(b4w_UpdateObj());
                            }
                        }
                    }
                }
                for(var i=0;i<ob.traces.length;i++){
                    b4w_SetObj(ob.traces[i]);
                    b4w_SetY((ob.traces.length-i)/(ob.traces.length-1)*5);
                    b4w_UpdateObj();
                }
                break;
            }
        }
        return ob;
    }

    var modMotors=function(param){
        var ob=makeOb('motors',param,{Power:[0,0],Speed:[0,0],SpeedMax:2,SpeedUp:2});
        ob.order=function(type){
            switch(type){
            case UPDATE:
                for(var i in [0,1]) ob.Speed[i]=limita(ob.Speed[i]+limita(ob.Power[i]*ob.SpeedMax-ob.Speed[i],ob.SpeedUp*SysDTime),ob.SpeedMax);
                break;
            }
        }
        return ob;
    }

    var modModel=function(param){
        var ob=makeOb('model');
        return ob;
    }


/*        obj.car=m_scenes.get_object_by_name("carcass");
        obj.body=m_scenes.get_object_by_name("body");
        obj.head=m_scenes.get_object_by_name("head");
        obj.wheel=m_scenes.get_object_by_name("wheelbig");   
        obj.track=m_scenes.get_object_by_name("track");   
        obj.trace=m_scenes.get_object_by_name("trace");
        obj.antena=m_scenes.get_object_by_name("antena");
        */

    var chassis=modChassis({B:74,T:80});
    var motors=modMotors();
    var carcass=modCarcass({Form:'carcass'});
    var wheels=modWheels({Bw:20,R:30+2,Form:'wheel'});   
    var tracks=modTracks({Width:11,Form:'track'});
    var traces=modTraces({Form:'trace_track'});
    
    var model=modModel();
    setupMod(model,chassis);
    setupMod(model,motors);
    setupMod(chassis,wheels);
    setupMod(chassis,carcass);
    setupMod(chassis,tracks);
    setupMod(model,traces);

    var ts=false;
    function update(){
        console.log("robot update");
        var Time=new Date();
        SysDTime=(Time-SysTime)/1000;
        SysTime=Time;

        var cmd=exchange.get('to-robot');
        if(isUndefined(cmd)){
            if(SysTime-SysMTime>2000){
                motors.Power=[0,0]
                exchange.put('to-cockpit',{error:'conect lost'});
            }
        }else{
            if(isDefined(cmd.powerL))motors.Power=[B2F(cmd.powerL),B2F(cmd.powerR)];
            if(isDefined(cmd.WHEELCHANGE)){
                ts=!ts;
                if(ts){
                    wheels=modWheels({Bw:34,R:55,Form:'wheelbig'});
                    tracks=modTracks2({Width:11});
                    setupMod(chassis,wheels);
                    setupMod(chassis,tracks)
                    traces.Form='trace_wheelbig';
                }else{
                    wheels=modWheels({Bw:50,R:20+2,Form:'wheelwide'});   
                    tracks=modTracks({Width:11,Form:'trackwide'});
                    setupMod(chassis,wheels);
                    setupMod(chassis,tracks)
                    traces.Form='trace_trackwide';
                }
            }
            SysMTime=SysTime;
        }

        updateMod(model);

        var speed=motors.Speed;
        var compass=chassis.W;

        exchange.put('to-cocpit',{speedL:speed[0],speedR:speed[1],compass:compass});
    }
    return {update:update};
}
        
          
exports.init = function() {
    m_app.init({
        canvas_container_id: "main_canvas_container",
        callback: init_cb,
        show_fps: true,
        console_verbose: true,
        autoresize: true
    });
}

function init_cb(canvas_elem, success) {
    if (!success){console.log("b4w init failure");return;}
    m_data.load("veterbot.json", load_cb);
}

function main_canvas_mouse(e) {
    if (e.preventDefault) e.preventDefault();
    var x = e.clientX;
    var y = e.clientY;
    //var obj = m_scenes.pick_object(x, y);
}

/*function onMessage(message){
    var cmd = JSON.parse(message.payloadString);
    exchange.put('localhost',cmd);
}*/

function update(){
    vCockpit.update();
    vRobot.update();
}

function load_cb(data_id) {
    vRobot=vRobotInit();
    vCockpit=vCockpitInit();

    //vRobot.update();
    //setInterval("vCockpit.update()",10);
    //setInterval("vRobot.update()",1);

    var cam = m_scenes.get_active_camera();
    var car=b4w_GetForm('carcass');
    m_cons.append_follow(cam, car, 7, 16)
    
    m_main.append_loop_cb(update);
    //m_client = connect(sensor_topic + '/tacho', qos, onMessage);

    //var cam=b4w_LoadObj('camera');
}

});
b4w.require("veterbot").init();



/*
var antenaDX=0;
var antenaDY=0;
function antena_update(){
    if(robot.geom.move>0){
        m_geom.set_shape_key_value(antenaObj,"rx0",robot.geom.move);
        m_geom.set_shape_key_value(antenaObj,"rx1",0);
    } else {
        m_geom.set_shape_key_value(antenaObj,"rx1",-robot.geom.move);
        m_geom.set_shape_key_value(antenaObj,"rx0",0);
    }
}

function compass_update(){
    m_objects.set_nodemat_value(cockpit.panel, ['compass','Value'],robot.geom.a);    
}


function update(){   
    vRobot.update();
    vCockpit.update();
}

//    var config={typeID:0,types:[[30,80,93,11,true],[30,80,93,11,false]],colorID:0,colors:[[0.02,0.02,0.02],[0.5,0.0,0.0],[0.0,0.2,0.1],[0.0,0.1,0.3],[0.4,0.2,0.1]],colorf0:1.0,colorf1:0.5,cameraRotate:0,radiusRotate:37};

    function change_color(){
        config.colorID++;
        if(config.colorID>=config.colors.length)config.colorID=0;
        var rgb=config.colors[config.colorID];
        m_objects.set_nodemat_rgb(obj.body,  ['body','RGB'], rgb[0]*config.colorf0, rgb[1]*config.colorf0, rgb[2]*config.colorf0);
        m_objects.set_nodemat_rgb(obj.head, ['body','RGB'], rgb[0]*config.colorf1, rgb[1]*config.colorf1, rgb[2]*config.colorf1);
    }
 

    function camera_rotate(rule){
        config.cameraRotate+=2;
        var tsr=m_trans.get_tsr(obj.car);
        var x=tsr[0];
        var z=tsr[2];
        var tsr2=m_trans.get_tsr(obj.cam)
        var xr=config.radiusRotate*Math.sin(config.cameraRotate);
        var zr=config.radiusRotate*Math.cos(config.cameraRotate);
        m_trans.set_tsr(obj.cam,[tsr[0]+xr,tsr[1]+5,tsr[2]+zr,tsr2[3],tsr2[4],tsr2[5],tsr2[6],tsr2[7]]);
    }


        obj.sun=m_lights.get_lamps("SUN")[0];
        obj.cam=m_scenes.get_active_camera();

        obj.wheels=[];
        obj.tracks=[];
        obj.traces=[];

        m_cons.append_follow(obj.cam,obj.car, 7, 12)
        m_trans.set_translation(obj.cam,10,2,0);

        if(wG){
            for(var i=0;i<4;i++){
                obj.wheels[i]=m_objects.copy(obj.wheel,"wheel"+i);
                m_scenes.append_object(obj.wheels[i]);
            }
        }

        for(var i=0;i<tCount*2;i++) {
            obj.tracks[i]=m_objects.copy(obj.track,"track_me"+i,false);
            m_scenes.append_object(obj.tracks[i]);
        }
        
    }

    function draw(){
        var x=rX*sys.scale;
        var y=rZ*sys.scale;
        var z=-rY*sys.scale;
        var a=-rA;
        var aL=wA[0];
        var aR=-wA[1];
        var B=wB;
        var T=wT;
        
        m_trans.set_translation(obj.car,x,y,z);
        m_trans.set_rotation_euler(obj.car,0,a,0);

        for(var i=0;i<4;i++){
            var wx=wheels[i].x*sys.scale;
            var wy=wheels[i].z*sys.scale;
            var wz=-wheels[i].y*sys.scale;
            var wa=wheels[i].a;
            var wb=wheels[i].b;
            var wheel=obj.wheels[i];
            m_trans.set_translation(wheel,wx,wy,wz);
            var qL=quat.create();
            m_trans.set_rotation_rel_v(wheel,quat.rotateY(quat.rotateX(quat.rotateZ(quat.create(),Math.PI/2,qL),wb,qL),wa,qL));
        }

        for(var i=0;i<tCount*2;i++){
            var p=tracks[i];
            var ta=p.a;
            var tb=p.b;
            var qL=quat.create();
            m_trans.set_rotation_rel_v(obj.tracks[i],quat.rotateX(quat.rotateY(qL,tb,qL),ta,qL));
            m_trans.set_translation(obj.tracks[i],p.x*sys.scale,p.z*sys.scale,-p.y*sys.scale);
        }

        for(var i=0;i<sCount;i++){
            var p=traces[i];
            if(obj.traces[i]==undefined){
                obj.traces[i]=m_objects.copy(obj.trace,"trace"+i,true);
                m_scenes.append_object(obj.traces[i]);
            }
            var f=Math.sin((1-(i+1)/sCount)*Math.PI/2);
            var h=12*f;
            m_trans.set_translation(obj.traces[i],p.x*sys.scale,-h*sys.scale,-p.y*sys.scale);
            var qL=quat.create();
            m_trans.set_rotation_rel_v(obj.traces[i],quat.rotateY(qL,p.b,qL));
                


            if(tracks.position[i].cp){
                tracks.position[i].cp=false;
                var trace=m_objects.copy(traceObj,"trace"+tracks.last++,true);
                traces.push(trace);
                m_scenes.append_object(trace);
                var tsr=m_trans.get_tsr(track);
                tsr[3]=Math.random()*0.5+0.5;
                m_trans.set_tsr(trace,tsr);
                if(traces.length>robot.track.count*20) m_scenes.remove_object(traces.shift());
            }
        }
    }
   

    return {update:update}
}();
*/
