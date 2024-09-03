const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');  // For file uploads
const path = require('path');

// Initialize express app
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configure session middleware
app.use(session({
    secret: 'your_secret_key',  // Replace with a secure secret key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }  // Set to true if using HTTPS
}));

// MySQL database connection
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1231',
    database: 'nodejs'
});

connection.connect(error => {
    if (error) {
        console.error('Database connection error:', error);
        throw error;
    }
    console.log('Connected to Database successfully!');
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Serve static files
app.use('/assets', express.static('assets'));
app.use('/uploads', express.static('uploads'));

// Serve login page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Serve welcome page for students
app.get('/logged', (req, res) => {
    if (req.session.username && req.session.role === 'student') {
        res.sendFile(__dirname + '/logged.html');
    } else {
        res.redirect('/');
    }
});

// Serve faculty page
app.get('/faculty', (req, res) => {
    if (req.session.username && req.session.role === 'faculty') {
        res.sendFile(__dirname + '/faculty.html');
    } else {
        res.redirect('/');
    }
});

// Serve admin page
app.get('/admin', (req, res) => {
    if (req.session.username && req.session.role === 'admin') {
        res.sendFile(__dirname + '/admin.html');
    } else {
        res.redirect('/');
    }
});

// Handle login requests
app.post('/login', (req, res) => {
    const { username, password, role } = req.body;

    // Validate user credentials
    const query = 'SELECT role, password FROM users WHERE username = ?';
    connection.query(query, [username], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.redirect('/?error=invalid');
        }

        if (results.length > 0) {
            const user = results[0];

            // Check if the role from the database matches the provided role
            if (user.role !== role) {
                return res.redirect('/?error=invalid');
            }

            // Compare plain-text password (ensure passwords are securely hashed in a real application)
            if (password === user.password) {
                req.session.username = username;
                req.session.role = user.role;
                switch (user.role) {
                    case 'student':
                        res.redirect('/logged');
                        break;
                    case 'faculty':
                        res.redirect('/faculty');
                        break;
                    case 'admin':
                        res.redirect('/admin');
                        break;
                    default:
                        res.redirect('/?error=invalid');
                }
            } else {
                res.redirect('/?error=invalid');
            }
        } else {
            res.redirect('/?error=invalid');
        }
    });
});

// Fetch username from session
app.get('/get-username', (req, res) => {
    if (req.session.username) {
        res.json({ name: req.session.username });
    } else {
        res.status(401).json({ error: 'User not logged in' });
    }
});

// Handle logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/');
    });
});

// Fetch classes for the faculty
app.get('/get-classes', (req, res) => {
    const facultyUsername = req.session.username;
    const query = 'SELECT class_name FROM classes WHERE faculty_username = ?';
    connection.query(query, [facultyUsername], (err, results) => {
        if (err) {
            console.error('Error fetching classes:', err);
            return res.status(500).json({ error: 'Error fetching classes' });
        }
        res.json({ classes: results });
    });
});

// Fetch students for a selected class
app.get('/get-students', (req, res) => {
    const className = req.query.class_name;
    if (!className) {
        return res.status(400).json({ error: 'Class name is required' });
    }
    const query = `
        SELECT 
            s.username AS student_username,
            s.username AS student_name
        FROM 
            student_classes sc
        JOIN 
            users s ON sc.student_username = s.username
        WHERE 
            sc.class_name = ?
    `;
    connection.query(query, [className], (err, results) => {
        if (err) {
            console.error('Error fetching students:', err);
            return res.status(500).json({ error: 'Error fetching students' });
        }
        res.json({ students: results });
    });
});

// Serve manage attendance page
app.get('/manage-attendance', (req, res) => {
    if (req.session.username && req.session.role === 'faculty') {
        res.sendFile(__dirname + '/manage_attendance.html');
    } else {
        res.redirect('/');
    }
});

// Record attendance for a class
app.post('/record-attendance', (req, res) => {
    const { date, attendance } = req.body; // attendance is an array of { student_username, class_name, status }

    // Convert the JSON string to an array of objects
    const attendanceData = JSON.parse(attendance);

    // Prepare the query for inserting or updating attendance records
    const insertQuery = `
        INSERT INTO attendance (student_username, class_name, date, status)
        VALUES ?
        ON DUPLICATE KEY UPDATE status = VALUES(status)
    `;

    // Map the attendance data to the required format
    const values = attendanceData.map(a => [a.student_username, a.class_name, date, a.status]);

    connection.query(insertQuery, [values], (err, results) => {
        if (err) {
            console.error('Error recording attendance:', err);
            return res.status(500).json({ error: 'Error recording attendance' });
        }
        res.json({ message: 'Attendance recorded successfully' });
    });
});

app.get('/view-attendance-data', (req, res) => {
    const studentUsername = req.session.username;
    const query = `
        SELECT 
            a.date,
            a.class_name,
            a.status,
            CASE 
                WHEN a.status = 'present' THEN 'Present'
                ELSE 'Absent'
            END AS status_text
        FROM 
            attendance a
        WHERE 
            a.student_username = ?
    `;
    connection.query(query, [studentUsername], (err, results) => {
        if (err) {
            console.error('Error fetching attendance:', err);
            return res.status(500).json({ error: 'Error fetching attendance' });
        }
        res.json({ attendance: results });
    });
});

app.get('/view-attendance', (req, res) => {
    if (req.session.username) {
        res.sendFile(__dirname + '/view_attendance.html');
    } else {
        res.redirect('/login');
    }
});

// Serve OD request form page for students
app.get('/apply-od', (req, res) => {
    if (req.session.username && req.session.role === 'student') {
        res.sendFile(__dirname + '/apply-od.html');
    } else {
        res.redirect('/');
    }
});

app.get('/faculty_od_requests', (req, res) => {
    if (req.session.username && req.session.role === 'faculty') {
        res.sendFile(__dirname + '/faculty_od_requests.html');
    } else {
        res.redirect('/');
    }
});
// Handle OD request submission with file upload
// Handle OD request submission with file upload
function formatDate(dateString) {
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-IN', options);
}

app.post('/submit-od-request', upload.single('proof_document'), (req, res) => {
    const { od_date, reason } = req.body;
    const studentUsername = req.session.username;
    const proofDocumentUrl = `/uploads/${req.file.filename}`;

    const formattedDate = new Date(od_date).toISOString().slice(0, 10);

    const insertQuery = `
        INSERT INTO od_requests (student_username, od_date, reason, proof_document_url, status)
        VALUES (?, ?, ?, ?, 'pending')
    `;

    connection.query(insertQuery, [studentUsername, formattedDate, reason, proofDocumentUrl], (err, results) => {
        if (err) {
            console.error('Error submitting OD request:', err);
            return res.status(500).json({ error: 'Error submitting OD request' });
        }
        res.json({ message: 'OD request submitted successfully' });
    });
});

app.get('/fetch-od-requests', (req, res) => {
    if (req.session.username && req.session.role === 'faculty') {
        const facultyUsername = req.session.username;

        const query = `
            SELECT od.id, od.od_date, od.student_username, od.reason, od.proof_document_url, od.status
            FROM od_requests od
            JOIN student_classes sc ON od.student_username = sc.student_username
            JOIN classes c ON sc.class_name = c.class_name
            JOIN users u ON c.faculty_username = u.username
            WHERE u.username = ?
        `;

        connection.query(query, [facultyUsername], (err, results) => {
            if (err) {
                console.error('Error fetching OD requests:', err);
                return res.status(500).json({ error: 'Error fetching OD requests' });
            }
            results.forEach(request => {
                request.od_date = formatDate(request.od_date);
            });
            res.json({ od_requests: results });
        });
    } else {
        res.redirect('/');
    }
});

app.post('/update-od-status', (req, res) => {
    if (req.session.username && req.session.role === 'faculty') {
        const { id, status } = req.body;
        const query = 'UPDATE od_requests SET status = ? WHERE id = ?';
        connection.query(query, [status, id], (err, results) => {
            if (err) {
                console.error('Error updating OD request status:', err);
                return res.status(500).json({ error: 'Error updating OD request status' });
            }
            res.json({ message: 'OD request status updated successfully' });
        });
    } else {
        res.redirect('/');
    }
});

app.get('/fetch-previous-od-requests', (req, res) => {
    const studentUsername = req.session.username;

    const query = 'SELECT od_date, reason, status FROM od_requests WHERE student_username = ?';
    connection.query(query, [studentUsername], (err, results) => {
        if (err) {
            console.error('Error fetching previous OD requests:', err);
            return res.status(500).json({ error: 'Error fetching previous OD requests' });
        }
        results.forEach(request => {
            request.od_date = formatDate(request.od_date);
        });
        res.json({ requests: results });
    });
});


// Handle grade upload


// Start the server
app.listen(4500, () => {
    console.log('Server running on http://localhost:4500');
});
