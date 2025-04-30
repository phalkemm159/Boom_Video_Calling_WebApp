import React, { useContext, useState } from 'react'
import withAuth from '../utils/withAuth'
import { useNavigate } from 'react-router-dom'
import "../App.css";
import { Button, IconButton, TextField } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import { AuthContext } from '../contexts/AuthContext';

function HomeComponent() {


    let navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");


    const {addToUserHistory} = useContext(AuthContext);
    let handleJoinVideoCall = async () => {
        await addToUserHistory(meetingCode)
        navigate(`/${meetingCode}`)
    }


    return (
        <>

            <div className="navBar">

                <div style={{ display: "flex", alignItems: "center" }}>

                    <h2>Boom Video Call</h2>
                </div>

                <div style={{ display: "flex", alignItems: "center" }}>
                    <button style={{ backgroundColor: "#f8f9fa", display: "flex", alignItems: "center" , paddingRight: "12px", border: "none", background: "White"}}  onClick={
                        () => {
                            navigate("/history")
                        }
                    }>
                    <IconButton className="btnHistory" style={{fontSize: "1rem"}}>
                        <RestoreIcon />
                        <p>History</p>
                    </IconButton>
                    </button>
                    <Button style={{color: "red"}} onClick={() => {
                        localStorage.removeItem("token")
                        navigate("/")
                    }}>
                        Logout
                    </Button>
                </div>


            </div>


            <div className="meetContainer">
                <div className="leftPanel">
                    <div>
                        <h2>Providing Quality Video Call Just Like Quality Education</h2>
                        <br />
                        <div>

                            <TextField fullWidth onChange={e => setMeetingCode(e.target.value)} id="outlined-basic" label="Meeting Code" variant="outlined" />
                            <br />
                            <br />
                            <Button style={{padding:"1rem", paddingLeft: "2rem", paddingRight: "2rem"}} onClick={handleJoinVideoCall} variant='contained'>Join</Button>

                        </div>
                    </div>
                </div>
                <div className='rightPanel'>
                    <img srcSet='/logo3.png' alt="" />
                </div>
            </div>
        </>
    )
}


export default withAuth(HomeComponent)