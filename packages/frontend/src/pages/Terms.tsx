import React from "react";
import { Link } from "react-router-dom";

export const Terms: React.FC = () => {
    return (
        <div className="app-main" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            <h1>Terms of Service</h1>
            <p style={{ color: '#888', marginBottom: '30px' }}>Last updated: {new Date().toLocaleDateString()}</p>

            <section style={{ marginBottom: '30px' }}>
                <h2>1. Acceptance of Terms</h2>
                <p>
                    By accessing and using OSRS Trading Tools, you agree to be bound by these Terms of Service.
                    If you do not agree to these terms, please do not use our service.
                </p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>2. Description of Service</h2>
                <p>
                    OSRS Trading Tools provides price tracking and notification tools for Old School RuneScape (OSRS) items.
                    The service includes:
                </p>
                <ul>
                    <li>Real-time and historical price data</li>
                    <li>Favorites management</li>
                    <li>Discord notifications for price changes</li>
                    <li>Price charts and analytics</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>3. User Accounts</h2>
                <h3>Account Creation</h3>
                <p>
                    You may create an account using a username and password, or by linking your Discord account.
                </p>

                <h3>Account Security</h3>
                <ul>
                    <li>You are responsible for maintaining the confidentiality of your account credentials</li>
                    <li>You are responsible for all activities that occur under your account</li>
                    <li>Notify us immediately of any unauthorized use of your account</li>
                </ul>

                <h3>Account Deletion</h3>
                <p>
                    You may delete your account at any time from your profile page. This action is permanent and cannot be undone.
                </p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>4. Acceptable Use</h2>
                <h3>You agree NOT to:</h3>
                <ul>
                    <li>Use the service for any illegal purpose</li>
                    <li>Attempt to gain unauthorized access to our systems</li>
                    <li>Abuse or spam our Discord notification system</li>
                    <li>Scrape or harvest data in an automated manner</li>
                    <li>Interfere with or disrupt the service</li>
                    <li>Impersonate any person or entity</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>5. Data Accuracy and Disclaimers</h2>
                <h3>No Warranty</h3>
                <p>
                    OSRS Trading Tools is provided "as is" without any warranties. We make no guarantees about:
                </p>
                <ul>
                    <li>The accuracy, completeness, or timeliness of price data</li>
                    <li>Uninterrupted or error-free service</li>
                    <li>The reliability of Discord notifications</li>
                </ul>

                <h3>Third-Party Data</h3>
                <p>
                    We rely on public OSRS APIs for price data. We are not responsible for errors or delays in third-party data sources.
                </p>

                <h3>Trading Decisions</h3>
                <p>
                    <strong>Important:</strong> This tool is for informational purposes only.
                    You are solely responsible for your in-game trading decisions.
                    We are not liable for any losses incurred from trades based on our data.
                </p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>6. Intellectual Property</h2>
                <p>
                    Old School RuneScape and all related content are trademarks and copyrights of Jagex Ltd.
                    This project is a fan-made tool and is not affiliated with or endorsed by Jagex.
                </p>
                <p>
                    The OSRS Trading Tools application code and design are the property of their respective creators.
                </p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>7. Discord Integration</h2>
                <p>
                    When using our Discord notification feature:
                </p>
                <ul>
                    <li>You must comply with Discord's Terms of Service</li>
                    <li>We may send you direct messages with price alerts</li>
                    <li>You can disable notifications or unlink your Discord account at any time</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>8. Limitation of Liability</h2>
                <p>
                    To the fullest extent permitted by law, OSRS Trading Tools and its creators shall not be liable for:
                </p>
                <ul>
                    <li>Any indirect, incidental, or consequential damages</li>
                    <li>Loss of profits, data, or business opportunities</li>
                    <li>Any damages arising from your use of the service</li>
                    <li>Issues caused by third-party services (Discord, OSRS APIs)</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>9. Service Modifications</h2>
                <p>
                    We reserve the right to:
                </p>
                <ul>
                    <li>Modify or discontinue the service at any time</li>
                    <li>Change features, pricing, or availability</li>
                    <li>Suspend or terminate accounts that violate these terms</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>10. Privacy</h2>
                <p>
                    Your use of the service is also governed by our <Link to="/privacy" style={{ color: '#4a9eff' }}>Privacy Policy</Link>.
                </p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>11. Changes to Terms</h2>
                <p>
                    We may update these Terms of Service from time to time. Continued use of the service after changes constitutes acceptance of the new terms.
                </p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h2>12. Contact</h2>
                <p>
                    Questions about these Terms of Service? Contact us through our GitHub repository or Discord server.
                </p>
            </section>

            <div style={{ marginTop: '40px', textAlign: 'center' }}>
                <Link to="/" className="page-button">Back to Home</Link>
            </div>
        </div>
    );
};
