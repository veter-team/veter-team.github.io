// MQTT connection parameters
command_topic = "/rtmsg/d25638bb-17c2-46ac-b26e-ce1f67268088/commands";
sensor_topic = "/rtmsg/d25638bb-17c2-46ac-b26e-ce1f67268088/sensors";
qos = 0;


function generateUUID()
{
    //var d = new Date().getTime();
    var d = Date.now()
    if(window.performance && typeof window.performance.now === "function")
    {
        d += performance.now(); //use high-precision timer if available
    }
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	    var r = (d + Math.random()*16)%16 | 0;
	    d = Math.floor(d/16);
	    return (c=='x' ? r : (r&0x3|0x8)).toString(16);
	});
    return uuid;
}


function subscribe(client, topic, qos)
{
    console.info('Subscribing to: Topic: ', topic, '. QoS: ', qos);
    client.subscribe(topic, {qos: Number(qos)});
}


// called when the client connects
function onConnect(context)
{
    var ctx = context.invocationContext;
    // Once a connection has been made, make a subscription and send a message.
    console.log("Client Connected. Context:");
    console.log(context);
    var statusSpan = document.getElementById("connectionstatus");
    if(statusSpan)
        statusSpan.innerHTML = "Connected to: " + ctx.host
	                           + ':' + ctx.port
	                           + ' with client ID ' + ctx.clientId;

    // Subscribe to notifications
    subscribe(ctx.client, ctx.topic, ctx.qos);
}


// called when the client loses its connection
function onConnectionLost(responseObject)
{
    if (responseObject.errorCode !== 0)
    {
	    console.log("Connection Lost: " + responseObject.errorMessage);
	    var statusSpan = document.getElementById("connectionstatus");
        if(statusSpan)
	        statusSpan.innerHTML = "Connection lost";
    }
}


function connect(subscribe_topic, qos, onMessageArrived)
{
    var hostname = 'test.mosquitto.org';
    var port = 8080;
    //var hostname = '10.110.20.103';
    //var port = 9001;
    var clientId = generateUUID();

    console.info('Connecting to Server: Hostname: ', hostname, '. Port: ', port, '. Client ID: ', clientId);
    client = new Paho.MQTT.Client(hostname, Number(port), clientId);
    // set callback handlers
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;

    // connect the client
    client.connect({onSuccess:onConnect,
		invocationContext: {host : hostname, 
                                    port: port, 
                                    clientId: clientId, 
                                    topic: subscribe_topic, 
                                    qos: qos, 
                                    client: client}
	});
    var statusSpan = document.getElementById("connectionstatus");
    statusSpan.innerHTML = 'Connecting...';

    return client;
}


function publish(client, message, topic, qos)
{
    if(message == undefined || !message)
	return;

    console.info('Publishing Message: Topic: ', topic, '. QoS: ' + qos + '. Message: ', message);
    message = new Paho.MQTT.Message(message);
    message.destinationName = topic;
    message.qos = Number(qos);
    client.send(message);
}
