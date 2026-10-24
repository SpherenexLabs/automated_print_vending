import { useState } from "react";
import { ADMIN_CREDENTIALS } from "../constants";

export function AdminLogin({ onAuthenticate, showStatusMessage }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();

    if (
      username === ADMIN_CREDENTIALS.username
      && password === ADMIN_CREDENTIALS.password
    ) {
      setPassword("");
      onAuthenticate();
      showStatusMessage("Admin login successful.", "success");
      return;
    }

    setPassword("");
    showStatusMessage("Invalid admin username or password.", "danger");
  };

  return (
    <main className="workspace admin-login-workspace">
      <section className="panel admin-login-panel">
        <div>
          <p className="eyebrow">Restricted access</p>
          <h1>Admin login</h1>
          <p className="muted">Enter the administrator credentials to open the print queue.</p>
        </div>

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Username</span>
            <input
              autoComplete="username"
              autoFocus
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <button className="button button-primary" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
