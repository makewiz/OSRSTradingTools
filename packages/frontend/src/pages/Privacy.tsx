import React from "react";
import { Link } from "react-router-dom";

export const Privacy: React.FC = () => {
    return (
        <div className="app-main" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            <h1>Privacy Policy</h1>
            <p style={{ color: '#888', marginBottom: '30px' }}>Last updated: {new Date().toLocaleDateString()}</p>

            <section style={{ marginBottom: '30px' }}>
                <h2>Introduction</h2>
                <p>
                    OSRS Trading Tools ("we", "our", or "us") respects your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our service.
                </p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>Information We Collect</h2>
                <h3>Account Information</h3>
                <ul>
                    <li><strong>Username:</strong> Required for account creation</li>
                    <li><strong>Email:</strong> Optional, used for account recovery</li>
                    <li><strong>Password:</strong> Stored securely using bcrypt hashing</li>
                </ul>

                <h3>Discord Integration (Optional)</h3>
                <ul>
                    <li><strong>Discord User ID:</strong> When you link your Discord account</li>
                    <li><strong>Discord Username:</strong> For display purposes</li>
                    <li><strong>Email:</strong> Provided by Discord OAuth (if granted)</li>
                </ul>

                <h3>Usage Data</h3>
                <ul>
                    <li><strong>Favorites:</strong> Items you mark as favorites</li>
                    <li><strong>Notification Settings:</strong> Your price alert preferences</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>How We Use Your Information</h2>
                <ul>
                    <li>To provide and maintain our service</li>
                    <li>To authenticate your account</li>
                    <li>To send Discord notifications (if enabled)</li>
                    <li>To save your preferences and favorites</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>Data Storage</h2>
                <p>
                    We use <strong>localStorage</strong> in your browser to store your authentication token and session data.
                    This is not a tracking cookie and is only used for authentication purposes.
                </p>
                <p>
                    Your account data is stored securely in our database with the following protections:
                </p>
                <ul>
                    <li>Passwords are hashed using bcrypt</li>
                    <li>Database connections are encrypted</li>
                    <li>We do not sell or share your data with third parties</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>Third-Party Services</h2>
                <h3>Discord OAuth</h3>
                <p>
                    When you choose to link your Discord account, we use Discord's OAuth 2.0 for authentication.
                    Please review <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#5865f2' }}>Discord's Privacy Policy</a> for information on how they handle your data.
                </p>

                <h3>OSRS Data</h3>
                <p>
                    We fetch Old School RuneScape item prices and data from public APIs. We do not collect any in-game data about you.
                </p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>Your Rights</h2>
                <ul>
                    <li><strong>Access:</strong> View your data anytime in your profile</li>
                    <li><strong>Update:</strong> Modify your notification preferences</li>
                    <li><strong>Delete:</strong> Permanently delete your account and all associated data from your profile page</li>
                    <li><strong>Unlink:</strong> Disconnect your Discord account at any time</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>Data Retention</h2>
                <p>
                    We retain your data for as long as your account is active. When you delete your account, we permanently remove:
                </p>
                <ul>
                    <li>Your user profile</li>
                    <li>All favorites</li>
                    <li>Discord link and notification settings</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>Children's Privacy</h2>
                <p>
                    Our service is not intended for users under 13 years of age. We do not knowingly collect information from children.
                </p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>Changes to This Policy</h2>
                <p>
                    We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last updated" date.
                </p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>Contact</h2>
                <p>
                    If you have questions about this Privacy Policy, please contact us through our GitHub repository or Discord server.
                </p>
            </section>

            <div style={{ marginTop: '40px', textAlign: 'center' }}>
                <Link to="/" className="page-button">Back to Home</Link>
            </div>
        </div>
    );
};
