import React, { useEffect, useRef, useState } from 'react'
import io from "socket.io-client";
import { Badge, IconButton, TextField } from '@mui/material';
import { Button } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import styles from "../styles/videoComponent.module.css";
import "../styles/videoComponent.module.css";
import CallEndIcon from '@mui/icons-material/CallEnd'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare'
import ChatIcon from '@mui/icons-material/Chat'
import server from '../environment';

const server_url = server;

var connections = {};

const peerConfigConnections = {
    "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" }
    ]
}

export default function VideoMeetComponent() {

    var socketRef = useRef();
    let socketIdRef = useRef();

    let localVideoRef = useRef();

    let [videoAvailable, setVideoAvailable] = useState(true);

    let [audioAvailable, setAudioAvailable] = useState(true);

    let [video, setVideo] = useState(false);

    let [audio, setAudio] = useState(false);

    let [screen, setScreen] = useState(false);

    let [showModal, setModal] = useState(true);

    let [screenAvailable, setScreenAvailable] = useState(false);

    let [messages, setMessages] = useState([])

    let [message, setMessage] = useState("");

    let [newMessages, setNewMessages] = useState(3);

    let [askForUsername, setAskForUsername] = useState(true);

    let [username, setUsername] = useState("");

    const videoRef = useRef([])

    let [videos, setVideos] = useState([])

    useEffect(() => {
        console.log("HELLO")
        
        // Handle AudioContext initialization early
        try {
            let AudioContext = window.AudioContext || window.webkitAudioContext;
            window._audioCtx = new AudioContext();
        } catch (e) {
            console.log("Failed to initialize AudioContext:", e);
        }
        
        // Only run permission check once on component mount
        getPermissions();
        
        // Cleanup function to ensure all resources are released
        return () => {
            try {
                if (window.localStream) {
                    window.localStream.getTracks().forEach(track => track.stop());
                }
                
                if (window._audioCtx) {
                    window._audioCtx.close();
                }
                
                // Close any peer connections
                Object.values(connections).forEach(connection => {
                    if (connection && typeof connection.close === 'function') {
                        connection.close();
                    }
                });
            } catch (e) {
                console.log("Cleanup error:", e);
            }
        };
    }, []); // Empty dependency array ensures this runs only once

    let getDislayMedia = () => {
        if (screen) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(getDislayMediaSuccess)
                    .catch((e) => console.log(e))
            }
        }
    }

    const getPermissions = async () => {
        try {
            // Check video permission first
            try {
                const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
                setVideoAvailable(true);
                console.log('Video permission granted');
                
                // Stop video tracks immediately
                videoPermission.getTracks().forEach(track => track.stop());
            } catch (error) {
                setVideoAvailable(false);
                console.log('Video permission denied', error);
            }

            // Check audio permission separately - with constraint options to help with some system denials
            try {
                const audioConstraints = {
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                };
                const audioPermission = await navigator.mediaDevices.getUserMedia(audioConstraints);
                setAudioAvailable(true);
                console.log('Audio permission granted');
                
                // Stop audio tracks immediately
                audioPermission.getTracks().forEach(track => track.stop());
            } catch (error) {
                setAudioAvailable(false);
                console.log('Audio permission denied', error);
            }

            // Check screen sharing availability (not actually requesting permission yet)
            setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

            // Set up local video preview - only attempt with video, not audio
            // This helps avoid unnecessary permission dialogs causing confusion
            try {
                // Only try to set up preview with video - audio will be handled later
                if (videoAvailable) {
                    const userMediaStream = await navigator.mediaDevices.getUserMedia({ 
                        video: true, 
                        audio: false // Don't request audio for preview
                    });
                    
                    if (userMediaStream && localVideoRef.current) {
                        window.localStream = userMediaStream;
                        localVideoRef.current.srcObject = userMediaStream;
                    }
                } else {
                    // If video isn't available, just create a black screen for preview
                    let blackScreen = ({ width = 640, height = 480 } = {}) => {
                        let canvas = Object.assign(document.createElement("canvas"), { width, height });
                        canvas.getContext('2d').fillRect(0, 0, width, height);
                        return canvas.captureStream();
                    };
                    
                    if (localVideoRef.current) {
                        window.localStream = blackScreen();
                        localVideoRef.current.srcObject = window.localStream;
                    }
                }
            } catch (error) {
                console.log("Error setting up preview:", error);
                
                // Fallback to black screen if we can't set up preview
                try {
                    let blackScreen = ({ width = 640, height = 480 } = {}) => {
                        let canvas = Object.assign(document.createElement("canvas"), { width, height });
                        canvas.getContext('2d').fillRect(0, 0, width, height);
                        return canvas.captureStream();
                    };
                    
                    if (localVideoRef.current) {
                        window.localStream = blackScreen();
                        localVideoRef.current.srcObject = window.localStream;
                    }
                } catch (canvasError) {
                    console.log("Failed to create fallback preview:", canvasError);
                }
            }
        } catch (error) {
            console.log("Permission error:", error);
        }
    };

    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia();
            console.log("SET STATE HAS ", video, audio);
        }
    }, [video, audio])

    let getMedia = () => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer();
    }

    let getUserMediaSuccess = (stream) => {
        try {
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop())
            }
        } catch (e) { console.log(e) }

        window.localStream = stream
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream
        }

        for (let id in connections) {
            if (id === socketIdRef.current) continue

            connections[id].addStream(window.localStream)

            connections[id].createOffer().then((description) => {
                console.log(description)
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
                    })
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setVideo(false);
            setAudio(false);

            try {
                let tracks = localVideoRef.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            localVideoRef.current.srcObject = window.localStream

            for (let id in connections) {
                connections[id].addStream(window.localStream)

                connections[id].createOffer().then((description) => {
                    connections[id].setLocalDescription(description)
                        .then(() => {
                            socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
                        })
                        .catch(e => console.log(e))
                })
            }
        })
    }

    let getUserMedia = () => {
        // First ensure we stop any existing streams
        try {
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (localVideoRef.current && localVideoRef.current.srcObject) {
                let existingTracks = localVideoRef.current.srcObject.getTracks();
                existingTracks.forEach(track => track.stop());
            }
        } catch (e) { 
            console.log("Error stopping existing tracks:", e);
        }
        
        // Attempt to get requested media based on availability
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            // Create appropriate constraints based on what's available and requested
            const constraints = {
                video: video && videoAvailable ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } : false,
                audio: audio && audioAvailable ? {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } : false
            };
            
            console.log("Requesting media with constraints:", constraints);
            
            navigator.mediaDevices.getUserMedia(constraints)
                .then(getUserMediaSuccess)
                .catch((e) => {
                    console.log("Error getting user media:", e);
                    
                    // Try a more basic request if detailed constraints failed
                    const basicConstraints = {
                        video: video && videoAvailable,
                        audio: audio && audioAvailable
                    };
                    
                    console.log("Retrying with basic constraints:", basicConstraints);
                    
                    navigator.mediaDevices.getUserMedia(basicConstraints)
                        .then(getUserMediaSuccess)
                        .catch((retryError) => {
                            console.log("Retry also failed:", retryError);
                            // If both attempts fail, fallback to black screen and silence
                            createFallbackStream();
                        });
                });
        } else {
            // Create fallback stream if no media is requested or available
            createFallbackStream();
        }
    }
    
    // Helper function to create a fallback stream with black video and silent audio
    let createFallbackStream = () => {
        try {
            // Create a MediaStream with a black video track and silent audio track
            const blackTrack = black();
            const silentTrack = silence();
            
            if (blackTrack && silentTrack) {
                window.localStream = new MediaStream([blackTrack, silentTrack]);
            } else if (blackTrack) {
                window.localStream = new MediaStream([blackTrack]);
            } else {
                // Last resort - create an empty MediaStream
                window.localStream = new MediaStream();
            }
            
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = window.localStream;
            }
        } catch (e) {
            console.log("Error creating fallback stream:", e);
        }
    }

    let getDislayMediaSuccess = (stream) => {
        console.log("Screen sharing success")
        try {
            if (window.localStream) {
                window.localStream.getTracks().forEach(track => track.stop())
            }
        } catch (e) { console.log(e) }

        window.localStream = stream
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream
        }

        for (let id in connections) {
            if (id === socketIdRef.current) continue

            connections[id].addStream(window.localStream)

            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
                    })
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setScreen(false)

            try {
                if (localVideoRef.current && localVideoRef.current.srcObject) {
                    let tracks = localVideoRef.current.srcObject.getTracks()
                    tracks.forEach(track => track.stop())
                }
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = window.localStream
            }

            getUserMedia()
        })
    }

    let gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message)

        if (fromId !== socketIdRef.current) {
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === 'offer') {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', fromId, JSON.stringify({ 'sdp': connections[fromId].localDescription }))
                            }).catch(e => console.log(e))
                        }).catch(e => console.log(e))
                    }
                }).catch(e => console.log(e))
            }

            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
            }
        }
    }

    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: false })

        socketRef.current.on('signal', gotMessageFromServer)

        socketRef.current.on('connect', () => {
            socketRef.current.emit('join-call', window.location.href)
            socketIdRef.current = socketRef.current.id

            socketRef.current.on('chat-message', addMessage)

            socketRef.current.on('user-left', (id) => {
                setVideos((videos) => videos.filter((video) => video.socketId !== id))
            })

            socketRef.current.on('user-joined', (id, clients) => {
                clients.forEach((socketListId) => {

                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections)
                    // Wait for their ice candidate       
                    connections[socketListId].onicecandidate = function (event) {
                        if (event.candidate != null) {
                            socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }))
                        }
                    }

                    // Wait for their video stream
                    connections[socketListId].onaddstream = (event) => {
                        console.log("BEFORE:", videoRef.current);
                        console.log("FINDING ID: ", socketListId);

                        let videoExists = videoRef.current.find(video => video.socketId === socketListId);

                        if (videoExists) {
                            console.log("FOUND EXISTING");

                            // Update the stream of the existing video
                            setVideos(videos => {
                                const updatedVideos = videos.map(video =>
                                    video.socketId === socketListId ? { ...video, stream: event.stream } : video
                                );
                                videoRef.current = updatedVideos;
                                return updatedVideos;
                            });
                        } else {
                            // Create a new video
                            console.log("CREATING NEW");
                            let newVideo = {
                                socketId: socketListId,
                                stream: event.stream,
                                autoplay: true,
                                playsinline: true
                            };

                            setVideos(videos => {
                                const updatedVideos = [...videos, newVideo];
                                videoRef.current = updatedVideos;
                                return updatedVideos;
                            });
                        }
                    };

                    // Add the local video stream
                    if (window.localStream !== undefined && window.localStream !== null) {
                        connections[socketListId].addStream(window.localStream)
                    } else {
                        let blackSilence = (...args) => new MediaStream([black(...args), silence()])
                        window.localStream = blackSilence()
                        connections[socketListId].addStream(window.localStream)
                    }
                })

                if (id === socketIdRef.current) {
                    for (let id2 in connections) {
                        if (id2 === socketIdRef.current) continue

                        try {
                            connections[id2].addStream(window.localStream)
                        } catch (e) { }

                        connections[id2].createOffer().then((description) => {
                            connections[id2].setLocalDescription(description)
                                .then(() => {
                                    socketRef.current.emit('signal', id2, JSON.stringify({ 'sdp': connections[id2].localDescription }))
                                })
                                .catch(e => console.log(e))
                        })
                    }
                }
            })
        })
    }

    let silence = () => {
        // Create AudioContext only when needed and after user interaction
        try {
            // Use a lazy-loaded AudioContext to prevent autoplay policy issues
            let AudioContext = window.AudioContext || window.webkitAudioContext;
            let ctx = new AudioContext();
            let oscillator = ctx.createOscillator();
            let dst = oscillator.connect(ctx.createMediaStreamDestination());
            oscillator.start();
            
            // Only resume if context is in suspended state
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            
            return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
        } catch (e) {
            console.log("Error creating silent audio track:", e);
            // Fallback method if AudioContext fails
            const canvas = document.createElement('canvas');
            const stream = canvas.captureStream();
            return Object.assign(new MediaStreamTrack(), { kind: 'audio', enabled: false });
        }
    }
    
    let black = ({ width = 640, height = 480 } = {}) => {
        try {
            // Create and configure canvas
            let canvas = Object.assign(document.createElement("canvas"), { width, height });
            const ctx = canvas.getContext('2d');
            
            // Draw black background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            
            // Add a small text/indicator that camera is off
            ctx.fillStyle = '#666666';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Camera Off', width/2, height/2);
            
            // Capture as stream and return video track
            let stream = canvas.captureStream();
            if (stream && stream.getVideoTracks().length > 0) {
                return Object.assign(stream.getVideoTracks()[0], { enabled: true });
            } else {
                throw new Error("Failed to get video track from canvas");
            }
        } catch (e) {
            console.log("Error creating black video track:", e);
            // Try to create a fake track as fallback
            try {
                return new MediaStreamTrack();
            } catch (fallbackError) {
                console.log("Fallback track creation failed:", fallbackError);
                return null;
            }
        }
    }

    let handleVideo = () => {
        // Handle video toggle with user interaction
        setVideo(!video);
        
        // If toggling video on after previously being denied permission, prompt again
        if (!video && !videoAvailable) {
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    setVideoAvailable(true);
                    stream.getTracks().forEach(track => track.stop());
                })
                .catch(e => {
                    console.log("Still denied video permission:", e);
                    // Show user-friendly alert
                    alert("Camera access was denied. Please check your browser settings and try again.");
                });
        }
        
        // Resume AudioContext if suspended (user interaction)
        if (window._audioCtx && window._audioCtx.state === 'suspended') {
            window._audioCtx.resume();
        }
    }
    
    let handleAudio = () => {
        // Handle audio toggle with user interaction
        setAudio(!audio);
        
        // If toggling audio on after previously being denied permission, prompt again
        if (!audio && !audioAvailable) {
            navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            })
            .then(stream => {
                setAudioAvailable(true);
                stream.getTracks().forEach(track => track.stop());
            })
            .catch(e => {
                console.log("Still denied audio permission:", e);
                // Show user-friendly alert
                alert("Microphone access was denied. Please check your browser settings and try again.");
            });
        }
        
        // Resume AudioContext if suspended (user interaction)
        if (window._audioCtx && window._audioCtx.state === 'suspended') {
            window._audioCtx.resume();
        }
    }

    useEffect(() => {
        if (screen !== undefined) {
            getDislayMedia();
        }
    }, [screen])
    
    let handleScreen = () => {
        setScreen(!screen);
    }

    let handleEndCall = () => {
        try {
            if (localVideoRef.current && localVideoRef.current.srcObject) {
                let tracks = localVideoRef.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            }
        } catch (e) { 
            console.log("Error ending call:", e);
        }
        window.location.href = "/"
    }

    let openChat = () => {
        setModal(true);
        setNewMessages(0);
    }
    
    let closeChat = () => {
        setModal(false);
    }
    
    let handleMessage = (e) => {
        setMessage(e.target.value);
    }

    const addMessage = (data, sender, socketIdSender) => {
        setMessages((prevMessages) => [
            ...prevMessages,
            { sender: sender, data: data }
        ]);
        if (socketIdSender !== socketIdRef.current) {
            setNewMessages((prevNewMessages) => prevNewMessages + 1);
        }
    };

    let sendMessage = () => {
        if (socketRef.current && message.trim() !== "") {
            socketRef.current.emit('chat-message', message, username)
            setMessage("");
        }
    }

    let connect = () => {
        if (username.trim() !== "") {
            // This is a user gesture that can be used to initialize AudioContext
            // Initialize audio context here to satisfy browser autoplay policy
            try {
                let AudioContext = window.AudioContext || window.webkitAudioContext;
                let ctx = new AudioContext();
                if (ctx.state === 'suspended') {
                    ctx.resume();
                }
                window._audioCtx = ctx; // Store for later use
            } catch (e) {
                console.log("Failed to initialize AudioContext:", e);
            }
            
            // Stop any existing streams before proceeding
            try {
                if (window.localStream) {
                    window.localStream.getTracks().forEach(track => track.stop());
                }
            } catch (e) {
                console.log("Error stopping existing stream:", e);
            }
            
            setAskForUsername(false);
            getMedia();
        }
    }

    return (
        <div>
            {askForUsername === true ?
                <div style={{ marginTop: "20px", marginLeft: "20px", marginRight: "20px" }}>
                    <h2>Enter into Lobby </h2>
                    <br /><br />
                    <TextField 
                        id="outlined-basic" 
                        label="Username" 
                        value={username} 
                        onChange={e => setUsername(e.target.value)} 
                        variant="outlined" 
                    />
                    <br /><br />
                    <Button variant="contained" onClick={connect}>Connect</Button>
                    <br /><br />
                    <br /><br />
                    
                    <div>
                        <video 
                            ref={localVideoRef} 
                            autoPlay 
                            muted 
                            style={{ width: "400px", height: "300px", borderRadius:"20%" }}
                        ></video>
                    </div>
                </div> :

                <div className={styles.meetVideoContainer}>
                    {showModal ? <div className={styles.chatRoom}>
                        <div className={styles.chatContainer}>
                            <h1>Chat :</h1>

                            <div className={styles.chattingDisplay}>
                                {messages.length !== 0 ? messages.map((item, index) => {
                                    return (
                                        <div style={{ marginBottom: "20px" }} key={index}>
                                            <p style={{ fontWeight: "bold" }}>{item.sender}</p>
                                            <p>{item.data}</p>
                                        </div>
                                    )
                                }) : <p>No Messages Yet</p>}
                            </div>

                            <div className={styles.chattingArea}>
                                <TextField 
                                    value={message} 
                                    onChange={(e) => setMessage(e.target.value)} 
                                    id="outlined-basic" 
                                    label="Enter Your chat" 
                                    variant="outlined" 
                                />
                                &nbsp;&nbsp;&nbsp;
                                <Button variant='contained' onClick={sendMessage}>Send</Button>
                            </div>
                        </div>
                    </div> : <></>}

                    <div className={styles.buttonContainers}>
                        <IconButton onClick={handleVideo} style={{ color: "white" }}>
                            {(video === true) ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        <IconButton onClick={handleEndCall} style={{ color: "red" }}>
                            <CallEndIcon />
                        </IconButton>
                        <IconButton onClick={handleAudio} style={{ color: "white" }}>
                            {audio === true ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable === true ?
                            <IconButton onClick={handleScreen} style={{ color: "white" }}>
                                {screen === true ? <ScreenShareIcon /> : <StopScreenShareIcon />}
                            </IconButton> : <></>}
                            
                        <Badge badgeContent={newMessages} max={999} color='orange'>
                            <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}>
                                <ChatIcon />
                            </IconButton>
                        </Badge>
                    </div>

                    <video className={styles.meetUserVideo} ref={localVideoRef} autoPlay muted></video>

                    <div className={styles.conferenceView}>
                        {videos.map((video) => (
                            <div key={video.socketId}>
                                <video
                                    data-socket={video.socketId}
                                    ref={ref => {
                                        if (ref && video.stream) {
                                            ref.srcObject = video.stream;
                                        }
                                    }}
                                    autoPlay
                                >
                                </video>
                            </div>
                        ))}
                    </div>
                </div>
            }
        </div>
    )
}