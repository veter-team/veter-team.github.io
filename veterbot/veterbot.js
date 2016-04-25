"use strict"

// register the application module
b4w.register("veterbot", function(exports, require) {

// import modules used by the app
var m_app       = require("app");
var m_data      = require("data");

var m_app       = require("app");
var m_data      = require("data");
var m_anim      = require("animation");
var m_scenes    = require("scenes");
var m_objects   = require("objects");
var m_mat       = require("material");
var m_tex       = require("textures");
var m_cfg       = require("config");
var m_trans     = require("transform");
var m_main      = require("main");
//var m_ctl       = require("controls");
var m_cons      = require("constraints");

var m_vec       = require("vec3");

var carcass;
var head;
var tracks = [];
var wheel_BL;
var wheel_BR;
var wheel_FL;
var wheel_FR;

/**
 * export the method to initialize the app (called at the bottom of this file)
 */
var sys = {
    scale:0.01
}

var robot = {
    geom:{x:0,y:0,z:35,a:0,sc:0,cs:1},
    force:{damping:0.9,speed:0.5, left:0, right:0,limit:2.5,cf:0},
    control:{forward:0,left:0,right:0,back:0},
    track:{count:45,left:0,right:0,lenght:0,pos:[]},
    carcass:{width:110,length:140},
    wheel:{T:93,R:30,B:80}
}

function dist(x0,y0,x1,y1){
    var dx=(x0-x1);
    var dy=(y0-y1);
    return math.sqrt(dx*dx+dy*dy);
}

function robot_init(){
    robot.track.length=2*Math.PI*robot.wheel.R+4*robot.wheel.B;
    robot.track.dlen=robot.track.length/robot.track.count;
    robot.track.seq=[];
    robot.track.seq[0]=robot.wheel.B;
    robot.track.seq[1]=robot.track.seq[0]+Math.PI*robot.wheel.R;
    robot.track.seq[2]=robot.track.seq[1]+2*robot.wheel.B;
    robot.track.seq[3]=robot.track.seq[2]+Math.PI*robot.wheel.R;
}
function track_calc(){
    var tls=[robot.track.length-robot.track.left,robot.track.length-robot.track.right];
    var z=[-robot.wheel.T,robot.wheel.T];
    for(var j=0;j<2;j++){
        var tl=tls[j];
        var xt=0;
        var yt=0;
        var dt=0;
        for(var i=0; i<robot.track.count; i++){
            var sl = (i*robot.track.dlen+tl)%robot.track.length;
            if(sl<robot.track.seq[0]){
                xt=robot.wheel.R;
                yt=sl;
                dt=0;
            }else if(sl<robot.track.seq[1]){
                var at=(sl-robot.wheel.B)/robot.wheel.R;
                xt=robot.wheel.R*Math.cos(at);
                yt=robot.wheel.R*Math.sin(at)+robot.wheel.B;
                dt=at;
            } else if(sl<robot.track.seq[2]){
                xt=-robot.wheel.R;
                yt=2*robot.wheel.B+robot.wheel.R*Math.PI-sl;
                dt=Math.PI;
            } else if(sl<robot.track.seq[3]){
                var at=(sl-3*robot.wheel.B+robot.wheel.R*Math.PI)/robot.wheel.R;
                xt=-robot.wheel.R*Math.cos(at);
                yt=-robot.wheel.R*Math.sin(at)-robot.wheel.B;
                dt=at-Math.PI;;
            } else {
                xt=robot.wheel.R;
                yt=sl-4*robot.wheel.B-2*robot.wheel.R*Math.PI;
                dt=0;
            }
            robot.track.pos[i+j*robot.track.count]={x:xt,y:yt,z:z[j],a:dt};
        }
    }
}

function robot_calc(){
    robot.force.left*=robot.force.damping;
    robot.force.right*=robot.force.damping;

    if(robot.control.forward){robot.force.left+=robot.force.speed;robot.force.right+=robot.force.speed;}
    if(robot.control.back)   {robot.force.left-=robot.force.speed;robot.force.right-=robot.force.speed;}
    if(robot.control.left)   {robot.force.left-=robot.force.speed;robot.force.right+=robot.force.speed;}
    if(robot.control.right)  {robot.force.left+=robot.force.speed;robot.force.right-=robot.force.speed;}

    if(robot.force.left< -robot.force.limit) robot.force.left= -robot.force.limit;
    if(robot.force.left>  robot.force.limit) robot.force.left=  robot.force.limit;
    if(robot.force.right<-robot.force.limit) robot.force.right=-robot.force.limit;
    if(robot.force.right> robot.force.limit) robot.force.right= robot.force.limit;

    var divs=5;
    var drot=(robot.force.left-robot.force.right)/(2*robot.wheel.T)/divs;
    var move=(robot.force.left+robot.force.right)/2/divs;
    var arot=robot.geom.a;
    var dx=0;
    var dy=0;
    for(var i=0;i<divs;i++){
        dx+=Math.sin(arot)*move;
        dy+=Math.cos(arot)*move;
        arot+=drot;
    }
    robot.force.cf=0;
    robot.geom.a=arot;
    robot.geom.sn=Math.sin(robot.a);
    robot.geom.cs=Math.cos(robot.a);
    robot.geom.x+=dx;
    robot.geom.y+=dy;

    console.log(robot.force);
    robot.track.left+=robot.force.left;
    robot.track.right+=robot.force.right;

    if(robot.track.left<0)robot.track.left+=robot.track.length;
    if(robot.track.left>robot.track.length)robot.track.left-=robot.track.length;
    if(robot.track.right<0)robot.track.right+=robot.track.length;
    if(robot.track.right>robot.track.length)robot.track.right-=robot.track.length;

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

/**
 * callback executed when the app is initialized 
 */
function init_cb(canvas_elem, success) {

    if (!success) {
        console.log("b4w init failure");
        return;
    }

    load();
    

    //canvas_elem.addEventListener("mousedown", main_canvas_click, false);
    //canvas_elem.addEventListener("keydown",   main_canvas_keybr, false);
    window.addEventListener('keydown',main_canvas_keybr,false);
    window.addEventListener('keyup',main_canvas_keybr,false);
}

/**
 * load the scene data
 */
function load() {
    m_data.load("veterbot.json", load_cb);
}

/**
 * callback executed when the scene is loaded
 */

function main_canvas_click(e) {
    alert(carcass.name);
    if (e.preventDefault)
        e.preventDefault();

    var x = e.clientX;
    var y = e.clientY;

    var obj = m_scenes.pick_object(x, y);
}

var KEY_CODE = {LEFT: 37,UP: 38,RIGHT: 39, DOWN: 40, W:87, S:83, A:65, D:68};

function main_canvas_keybr(e){
    switch(e.which){
    case KEY_CODE.LEFT:robot.control.left=(e.type=="keydown"?1:0);break;
    case KEY_CODE.RIGHT:robot.control.right=(e.type=="keydown"?1:0);break;
    case KEY_CODE.UP: robot.control.forward=(e.type=="keydown"?1:0);break;
    case KEY_CODE.DOWN: robot.control.back=(e.type=="keydown"?1:0);break;
    }
}

var frame = 0;
var rpos;
var gl=0;

function update_cb(){
    robot_calc();
    track_calc();
    
    m_trans.set_translation(carcass, robot.geom.x*sys.scale, robot.geom.z*sys.scale, -robot.geom.y*sys.scale);
    m_trans.set_rotation_euler(carcass, 0, -robot.geom.a, 0);

    var al = robot.track.left/robot.wheel.R;
    var ar = robot.track.right/robot.wheel.R;
    m_trans.set_rotation_euler_rel(wheel_FL, -al, 0, 0);
    m_trans.set_rotation_euler_rel(wheel_BL, -al, 0, 0);
    m_trans.set_rotation_euler_rel(wheel_FR, -ar, 0, 0);
    m_trans.set_rotation_euler_rel(wheel_BR, -ar, 0, 0);

    for(var i=0;i<robot.track.count*2;i++){
        var track=tracks[i];
        m_trans.set_rotation_euler(track, robot.track.pos[i].a, -robot.geom.a, 0);
        m_trans.set_translation_obj_rel(track, robot.track.pos[i].z*sys.scale, robot.track.pos[i].x*sys.scale, robot.track.pos[i].y*sys.scale, carcass);
    }

    
}

function setup_ui() {
}

function load_cb(data_id) {
    //m_app.enable_controls();
    //m_app.enable_camera_controls();
    

    robot_init();

    carcass = m_scenes.get_object_by_name("carcass");

    //head = m_scenes.get_object_by_name("head");

    wheel_BL = m_scenes.get_object_by_name("wheel.BL");
    wheel_BR = m_scenes.get_object_by_name("wheel.BR");
    wheel_FL = m_scenes.get_object_by_name("wheel.FL");
    wheel_FR = m_scenes.get_object_by_name("wheel.FR");

    tracks[0] = m_scenes.get_object_by_name("track");
    for(var i=1;i<robot.track.count*2;i++) {
        tracks[i]=m_objects.copy(tracks[0],"track"+i,true);
        m_scenes.append_object(tracks[i]);
    }

    var camobj = m_scenes.get_active_camera();
    //m_cons.append_stiff_trans(camobj, carcass, [0, 10, 17]);
    //m_cons.append_semi_soft_cam(camobj, carcass, [0, 10, 17], 0.25)
    m_cons.append_follow(camobj, carcass, 7, 12)
    //m_cons.append_stiff_trans(camobj, carcass, [0, 5, 7]);
    //m_cons.append_follow(camobj, carcass, 6, 8);
    
    setup_ui();

   
    m_main.append_loop_cb(update_cb);

}


});

// import the app module and start the app by calling the init method
b4w.require("veterbot").init();
