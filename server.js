const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// Database se connect hona
const db = new sqlite3.Database('./movies.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the movies database.');
});

// Admin table (for internal admin panel)
db.run(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
)`);

// Regular users table (for user-facing login)
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
)`);

// Admin user ko create karein agar woh exist nahi karta
const admin_username = 'admin';
const admin_password = 'password123';
bcrypt.hash(admin_password, 10, (err, hash) => {
    if (err) {
        console.error(err.message);
        return;
    }
    db.get('SELECT * FROM admin_users WHERE username = ?', [admin_username], (err, row) => {
        if (err) {
            console.error(err.message);
            return;
        }
        if (!row) {
            db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [admin_username, hash], (err) => {
                if (err) {
                    console.error(err.message);
                } else {
                    console.log('Admin user created successfully.');
                }
            });
        }
    });
});

// "requests" naam ka table banayein, ab user ID ke saath
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
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

// Session aur middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '')));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Auth middleware function (for admin)
const isAuthenticatedAdmin = (req, res, next) => {
    if (req.session.adminLoggedIn) {
        return next();
    }
    res.redirect('/admin/login');
};

// Auth middleware function (for user)
const isAuthenticatedUser = (req, res, next) => {
    if (req.session.userLoggedIn) {
        return next();
    }
    res.redirect('/user/login');
};

// --- ROUTES ---

// Main page route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- USER AUTHENTICATION ROUTES ---

// Signup page
app.get('/user/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'user_signup.html'));
});

// Signup post route
app.post('/user/signup', (req, res) => {
    const { email, password } = req.body;
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).send('Error hashing password.');
        db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hash], (err) => {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.send('This email is already registered. Please login.');
                }
                return res.status(500).send('Database error.');
            }
            res.send('Signup successful! Please <a href="/user/login">login</a>.');
        });
    });
});

// User login page
app.get('/user/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'user_login.html'));
});

// User login post route
app.post('/user/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).send('Database error.');
        if (!user) return res.send('Invalid email or password.');

        bcrypt.compare(password, user.password_hash, (err, result) => {
            if (result) {
                req.session.userLoggedIn = true;
                req.session.userEmail = user.email;
                res.redirect('/user/dashboard');
            } else {
                res.send('Invalid email or password.');
            }
        });
    });
});

// User logout route
app.get('/user/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return console.error(err);
        res.redirect('/user/login');
    });
});

// --- USER DASHBOARD ---
// User dashboard page
app.get('/user/dashboard', isAuthenticatedUser, (req, res) => {
    const userEmail = req.session.userEmail;
    db.all('SELECT * FROM requests WHERE user_email = ? ORDER BY id DESC', [userEmail], (err, rows) => {
        if (err) return res.status(500).send('Database error.');
        
        let html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>My Dashboard</title>
                <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Poppins', sans-serif; background-color: #f0f2f5; margin: 0; padding: 2em; }
                    .container { max-width: 900px; margin: auto; background: white; padding: 2em; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
                    h1 { text-align: center; color: #333; }
                    .logout-btn { display: inline-block; padding: 8px 15px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; }
                    .request-form { margin-top: 2em; text-align: center; }
                    .request-form input { width: 80%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
                    .request-form button { padding: 10px 20px; background-color: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; }
                    table { width: 100%; border-collapse: collapse; margin-top: 1em; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background-color: #007bff; color: white; }
                    tr:nth-child(even) { background-color: #f2f2f2; }
                    .status-pending { color: #ffc107; font-weight: bold; }
                    .status-completed { color: #28a745; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <a href="/user/logout" class="logout-btn">Logout</a>
                    <h1>Welcome, ${req.session.userEmail}</h1>
                    <p>Here are your movie requests:</p>
                    
                    <div class="request-form">
                        <h2>Request a New Movie</h2>
                        <form action="/request-movie" method="post">
                            <input type="text" name="movieName" placeholder="Enter movie name" required>
                            <button type="submit">Submit Request</button>
                        </form>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Movie</th>
                                <th>Status</th>
                                <th>Link</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length > 0 ? rows.map(row => `
                                <tr>
                                    <td>${row.movie_name}</td>
                                    <td><span class="status-${row.status}">${row.status.charAt(0).toUpperCase() + row.status.slice(1)}</span></td>
                                    <td>${row.link ? `<a href="${row.link}">${row.link}</a>` : 'Not ready yet'}</td>
                                </tr>
                            `).join('') : `<tr><td colspan="3">You have no requests yet.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </body>
            </html>
        `;
        res.send(html);
    });
});

// --- ADMIN ROUTES ---

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM admin_users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).send('Database error.');
        if (!user) return res.send('Invalid username or password.');

        bcrypt.compare(password, user.password_hash, (err, result) => {
            if (result) {
                req.session.adminLoggedIn = true;
                res.redirect('/admin');
            } else {
                res.send('Invalid username or password.');
            }
        });
    });
});

app.get('/admin', isAuthenticatedAdmin, (req, res) => {
    const sql = `SELECT * FROM requests ORDER BY id DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).send('Database error.');
        let html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Admin Dashboard</title>
                <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Poppins', sans-serif; background-color: #f0f2f5; margin: 0; padding: 2em; }
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
                    <a href="/admin/logout">Logout</a>
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

app.post('/add-link', isAuthenticatedAdmin, (req, res) => {
    const { id, link } = req.body;
    db.run(`UPDATE requests SET link = ?, status = 'completed' WHERE id = ?`, [link, id], function(err) {
        if (err) return res.status(500).send('Database error.');
        db.get('SELECT movie_name, user_email FROM requests WHERE id = ?', [id], (err, row) => {
            if (err || !row) return res.redirect('/admin');
            const mailOptions = {
                from: process.env.GMAIL_USER,
                to: row.user_email,
                subject: `Your movie request for "${row.movie_name}" is ready!`,
                html: `<p>Good news! Your requested movie, <b>${row.movie_name}</b>, is now available. You can find the direct download link here: <a href="${link}">${link}</a></p>`
            };
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) console.error('Error sending email:', error);
                else console.log('Email sent:', info.response);
            });
            res.redirect('/admin');
        });
    });
});

app.post('/update-status', isAuthenticatedAdmin, (req, res) => {
        const requestId = req.body.id;
    const sql = `UPDATE requests SET status = 'completed' WHERE id = ?`;
    db.run(sql, [requestId], function(err) {
        if (err) return res.status(500).send('Database error.');
        res.redirect('/admin');
    });
});

app.post('/delete-request', isAuthenticatedAdmin, (req, res) => {
    const requestId = req.body.id;
    const sql = `DELETE FROM requests WHERE id = ?`;
    db.run(sql, [requestId], function(err) {
        if (err) return res.status(500).send('Database error.');
        res.redirect('/admin');
    });
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return console.error(err);
        res.redirect('/admin/login');
    });
});

// --- Movie Request Route ---
app.post('/request-movie', isAuthenticatedUser, (req, res) => {
    const movieName = req.body.movieName;
    const userEmail = req.session.userEmail;

    const sql = `INSERT INTO requests(movie_name, user_email) VALUES(?, ?)`;
    db.run(sql, [movieName, userEmail], function(err) {
        if (err) return res.status(500).send('Database error.');
        res.send('Request submitted successfully!');
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});