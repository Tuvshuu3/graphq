import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LinkButton } from "../components";
import { createUser, loginUser } from "../api";
import "../styles/Login.css";

const initialSignupForm = {
  username: "",
  password: "",
  role: "patient",
  age: "",
};

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [signupForm, setSignupForm] = useState(initialSignupForm);
  const [signupMessage, setSignupMessage] = useState("");

  const handleChange = (e) => {
    setUsername(e.target.value);
    setError("");
  };

  const handleLogin = async () => {
    try {
      const user = await loginUser({
        username: username.trim(),
        password,
      });

      if (user.role === "admin") {
        navigate("/adminHome");
        return;
      }

      if (user.role === "caretaker") {
        navigate(`/caretakerHome?caretakerId=${user.userId}`);
        return;
      }

      navigate(`/patientHome?patientId=${user.patientId}`);
    } catch (error) {
      console.error(error);
      setError(error.message);
    }
  };

  const handleSignupChange = (event) => {
    const { name, value } = event.target;
    setSignupForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
    setSignupMessage("");
  };

  const handleSignup = async (event) => {
    event.preventDefault();

    try {
      await createUser(signupForm);
      setUsername(signupForm.username);
      setPassword(signupForm.password);
      setSignupMessage("Account created.");
      setSignupForm(initialSignupForm);
      setIsSignupOpen(false);
    } catch (error) {
      setSignupMessage(error.message);
    }
  };

  return (
    <div className="body">
      <div className="loginCont">
        <div className="loginHeader">
          <h1>Care Bell</h1>
        </div>
        <div className="inputCont">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={handleChange}
            className="inputField"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError("");
            }}
            className="inputField"
          />
          {error && <div className="loginError">{error}</div>}
          <LinkButton onLogin={handleLogin} />
          <button
            className="signupButton"
            type="button"
            onClick={() => setIsSignupOpen(true)}
          >
            Sign up
          </button>
          {signupMessage && <div className="loginError">{signupMessage}</div>}
        </div>
      </div>

      {isSignupOpen && (
        <div className="signupBackdrop">
          <form className="signupModal" onSubmit={handleSignup}>
            <div className="loginHeader">
              <h1>Sign up</h1>
              <p>Create a patient or caretaker account</p>
            </div>

            <div className="inputCont">
              <input
                className="inputField"
                name="username"
                placeholder="Username"
                value={signupForm.username}
                onChange={handleSignupChange}
                required
              />
              <input
                className="inputField"
                name="password"
                type="password"
                placeholder="Password"
                value={signupForm.password}
                onChange={handleSignupChange}
                required
              />
              <select
                className="inputField"
                name="role"
                value={signupForm.role}
                onChange={handleSignupChange}
              >
                <option value="patient">Patient</option>
                <option value="caretaker">Caretaker</option>
              </select>
              {signupForm.role === "patient" && (
                <input
                  className="inputField"
                  name="age"
                  type="number"
                  min="0"
                  placeholder="Age"
                  value={signupForm.age}
                  onChange={handleSignupChange}
                />
              )}
              {signupMessage && (
                <div className="loginError">{signupMessage}</div>
              )}
              <button className="loginButton" type="submit">
                Create account
              </button>
              <button
                className="signupButton"
                type="button"
                onClick={() => {
                  setIsSignupOpen(false);
                  setSignupForm(initialSignupForm);
                  setSignupMessage("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Login;
