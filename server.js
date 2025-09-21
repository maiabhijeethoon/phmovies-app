const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
const port = 3000;

// Database se connect hona
const db = new sqlite3.Database('./movies.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the movies database.');
});

// User table create karein
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
)`);

// Admin user ko create karein agar woh exist nahi karta
const username = 'admin';
const password = 'password123';
bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
        console.error(err.message);
        return;
    }
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error(err.message);
            return;
        }
        if (!row) {
            db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash], (err) => {
                if (err) {
                    console.error(err.message);
                } else {
                    console.log('Admin user created successfully.');
                }
            });
        }
    });
});

// "requests" naam ka table banayein, ab "user_email" column ke saath
db.run(`CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    link TEXT,
    status TEXT DEFAULT 'pending'
)`);

// Nodemailer configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'csoutlier@gmail.com', // Yahan apni Gmail ID daalo
        pass: 'myvk mkxb cxem owss'     // Yahan Google App Password daalo
    }
});

// Session aur middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '')));
app.use(session({
    secret: 'your_secret_key_here',
    resave: false,
    saveUninitialized: true
}));

// Auth middleware function
const isAuthenticated = (req, res, next) => {
    if (req.session.loggedIn) {
        return next();
    }
    res.redirect('/login');
};

// --- ROUTES ---

// Default route to serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route to handle movie requests and save to database
app.post('/request-movie', (req, res) => {
    const { movieName, userEmail } = req.body;
    const sql = `INSERT INTO requests(movie_name, user_email) VALUES(?, ?)`;
    db.run(sql, [movieName, userEmail], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Database error.');
        }
        console.log(`A new movie request for "${movieName}" from "${userEmail}" has been added.`);
        const requestId = this.lastID;
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Request Submitted</title>
                <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
                <style>
                    body { 
                        font-family: 'Poppins', sans-serif; 
                        text-align: center; 
                        padding: 50px; 
                        background-color: #f0f2f5; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        min-height: 100vh; 
                        margin: 0;
                    }
                    .container { 
                        background: white; 
                        padding: 3em; 
                        border-radius: 12px; 
                        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); 
                        display: inline-block; 
                        animation: fadeIn 1s ease-out;
                        max-width: 500px;
                        width: 90%;
                    }
                    h1 { 
                        color: #28a745; 
                        margin-bottom: 20px; 
                        font-weight: 600;
                        animation: slideIn 0.8s ease-out;
                    }
                    p {
                        color: #555;
                        font-size: 1.1em;
                        margin-bottom: 10px;
                    }
                    .status-link { 
                        margin-top: 30px; 
                        font-size: 1em;
                    }
                    a {
                        display: inline-block;
                        margin-top: 15px;
                        padding: 10px 25px;
                        background-color: #007bff;
                        color: white;
                        text-decoration: none;
                        border-radius: 6px;
                        transition: background-color 0.3s ease;
                    }
                    a:hover {
                        background-color: #0056b3;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes slideIn {
                        from { opacity: 0; transform: translateX(-20px); }
                        to { opacity: 1; transform: translateX(0); }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Request Submitted Successfully!</h1>
                    <p>Thank you for your request for <b>"${movieName}"</b>!</p>
                    <p>We will process it shortly.</p>
                    <p class="status-link">You can check the status of your request here:</p>
                    <a href="/status?id=${requestId}">Check Request Status</a>
                </div>
            </body>
            </html>
        `);
    });
});

// Naya route: User ko request status dikhane ke liye (Ismein abhi design change nahi hua hai)
app.get('/status', (req, res) => {
    const requestId = req.query.id;
    if (!requestId) {
        return res.send('No request ID provided.');
    }

    const sql = `SELECT movie_name, status, link FROM requests WHERE id = ?`;
    db.get(sql, [requestId], (err, row) => {
        if (err) {
            return res.status(500).send('Database error.');
        }
        if (!row) {
            return res.status(404).send('Request not found.');
        }

        let linkSection = '';
        if (row.status === 'completed' && row.link) {
            linkSection = `<p>Download link is ready: <a href="${row.link}">${row.link}</a></p>`;
        }

        // Updated HTML for the Status page
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Request Status</title>
                <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
                <style>
                    body { 
                        font-family: 'Poppins', sans-serif; 
                        text-align: center; 
                        padding: 50px; 
                        background-color: #f0f2f5; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        min-height: 100vh; 
                        margin: 0;
                    }
                    .container { 
                        background: white; 
                        padding: 3em; 
                        border-radius: 12px; 
                        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); 
                        display: inline-block; 
                        animation: fadeIn 1s ease-out;
                        max-width: 500px;
                        width: 90%;
                    }
                    h1 { 
                        color: #333; 
                        margin-bottom: 20px; 
                        font-weight: 600;
                        animation: slideIn 0.8s ease-out;
                    }
                    p {
                        color: #555;
                        font-size: 1.1em;
                        margin-bottom: 10px;
                    }
                    a {
                        display: inline-block;
                        margin-top: 15px;
                        padding: 10px 25px;
                        background-color: #007bff;
                        color: white;
                        text-decoration: none;
                        border-radius: 6px;
                        transition: background-color 0.3s ease;
                    }
                    a:hover {
                        background-color: #0056b3;
                    }
                    .status-pending { color: #ffc107; }
                    .status-completed { color: #28a745; }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes slideIn {
                        from { opacity: 0; transform: translateX(-20px); }
                        to { opacity: 1; transform: translateX(0); }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Request Status</h1>
                    <p><b>Movie:</b> ${row.movie_name}</p>
                    <p><b>Status:</b> <span class="status-${row.status}">${row.status.charAt(0).toUpperCase() + row.status.slice(1)}</span></p>
                    ${linkSection}
                </div>
            </body>
            </html>
        `);
    });
});

// Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Login post route
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Database error.');
        }
        if (!user) {
            return res.send('Invalid username or password.');
        }
        bcrypt.compare(password, user.password_hash, (err, result) => {
            if (result) {
                req.session.loggedIn = true;
                res.redirect('/admin');
            } else {
                res.send('Invalid username or password.');
            }
        });
    });
});

// Admin Panel route (ab password-protected hai)
app.get('/admin', isAuthenticated, (req, res) => {
    const sql = `SELECT * FROM requests ORDER BY id DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Database error.');
        }
        let html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Admin Dashboard</title>
                <style>
                    body { font-family: sans-serif; background-color: #f0f2f5; margin: 0; padding: 2em; }
                    .container { max-width: 900px; margin: auto; background: white; padding: 2em; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
                    h1 { text-align: center; color: #333; }
                    table { width: 100%; border-collapse: collapse; margin-top: 1em; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background-color: #007bff; color: white; }
                    tr:nth-child(even) { background-color: #f2f2f2; }
                    .btn-group { display: flex; gap: 5px; }
                    .btn-done { background-color: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
                    .btn-delete { background-color: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
                    .link-form input { border: 1px solid #ddd; padding: 5px; width: 250px; }
                    .link-form button { padding: 5px 10px; background-color: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; }
                </style>
            </head>
            <body>
                <div class="container">
                    <a href="/logout">Logout</a>
                    <h1>Admin Dashboard - Movie Requests</h1>
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Movie Name</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Link</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        rows.forEach((row) => {
            html += `
                <tr>
                    <td>${row.id}</td>
                    <td>${row.movie_name}</td>
                    <td>${row.user_email}</td>
                    <td>${row.status}</td>
                    <td>
                        <form class="link-form" action="/add-link" method="post">
                            <input type="hidden" name="id" value="${row.id}">
                            <input type="text" name="link" placeholder="Enter link" value="${row.link || ''}">
                            <button type="submit">Add Link</button>
                        </form>
                    </td>
                    <td>
                        <div class="btn-group">
                            <form action="/update-status" method="post">
                                <input type="hidden" name="id" value="${row.id}">
                                <button type="submit" class="btn-done">Done</button>
                            </form>
                            <form action="/delete-request" method="post">
                                <input type="hidden" name="id" value="${row.id}">
                                <button type="submit" class="btn-delete">Delete</button>
                            </form>
                        </div>
                    </td>
                </tr>
            `;
        });
        html += `
                        </tbody>
                    </table>
                </div>
            </body>
            </html>
        `;
        res.send(html);
    });
});

// Route to add a link to a movie request and send email
app.post('/add-link', isAuthenticated, (req, res) => {
    const { id, link } = req.body;
    db.run(`UPDATE requests SET link = ?, status = 'completed' WHERE id = ?`, [link, id], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Database error.');
        }
        db.get('SELECT movie_name, user_email FROM requests WHERE id = ?', [id], (err, row) => {
            if (err || !row) {
                console.error(err?.message || 'Email not found.');
                return res.redirect('/admin');
            }
            const mailOptions = {
                from: 'your_email@gmail.com',
                to: row.user_email,
                subject: `Your movie request for "${row.movie_name}" is ready!`,
                html: `
                    <p>Hi there,</p>
                    <p>Good news! Your requested movie, <b>${row.movie_name}</b>, is now available.</p>
                    <p>You can find the direct download link here: <a href="${link}">${link}</a></p>
                    <p>Enjoy the movie!</p>
                    <p>Best regards,<br>PH Movies</p>
                `
            };
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error sending email:', error);
                } else {
                    console.log('Email sent:', info.response);
                }
            });
            res.redirect('/admin');
        });
    });
});

// Route to update request status
app.post('/update-status', isAuthenticated, (req, res) => {
    const requestId = req.body.id;
    const sql = `UPDATE requests SET status = 'completed' WHERE id = ?`;
    db.run(sql, [requestId], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Database error.');
        }
        console.log(`Request ${requestId} marked as completed.`);
        res.redirect('/admin');
    });
});

// Route to delete a request
app.post('/delete-request', isAuthenticated, (req, res) => {
    const requestId = req.body.id;
    const sql = `DELETE FROM requests WHERE id = ?`;
    db.run(sql, [requestId], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Database error.');
        }
        console.log(`Request ${requestId} deleted.`);
        res.redirect('/admin');
    });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});