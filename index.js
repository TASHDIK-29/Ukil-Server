const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:5174']
}
app.use(cors(corsOptions))
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iepmiic.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection


        const advocatesCollection = client.db("Ukil").collection("advocates");
        const usersCollection = client.db("Ukil").collection("users");

        const SECRET_KEY = process.env.SECRET_KEY;

        // Register Advocate
        app.post('/advocate', async (req, res) => {
            const advocate = req.body;

            const query = { email: advocate.email };
            const existingAdvocate = await advocatesCollection.findOne(query);
            if (existingAdvocate) {
                return res.send({ message: 'advocate already exist!', insertedId: null })
            }

            const salt = await bcrypt.genSalt(10)
            const securePassword = await bcrypt.hash(req.body.password, salt)

            const advocateInfo = {
                name: req.body.name,
                email: req.body.email,
                number: req.body.number,
                license: req.body.license,
                yearOfPractice: req.body.yearOfPractice,
                chamber: req.body.chamber,
                practiceArea: req.body.practiceArea,
                eduQualification: req.body.eduQualification,
                university: req.body.university,
                graduationYear: req.body.graduationYear,
                password: securePassword,
            }
            const result = await advocatesCollection.insertOne(advocateInfo);

            res.send(result);
        })

        // Register User
        app.post('/user', async (req, res) => {
            const user = req.body;

            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exist!', insertedId: null })
            }

            const salt = await bcrypt.genSalt(10)
            const securePassword = await bcrypt.hash(req.body.password, salt)

            const userInfo = {
                name: req.body.name,
                email: req.body.email,
                number: req.body.number,
                password: securePassword,
            }
            const result = await usersCollection.insertOne(userInfo);

            res.send(result);
        })


        // Login API
        app.post('/login', async (req, res) => {
            const { email, password, userType } = req.body;

            // console.log('email, pin, userType', email, password, userType);

            const query = { email: email };
            let user = {};

            if (userType == 'Advocate') {
                user = await advocatesCollection.findOne(query);
            }
            else {
                user = await usersCollection.findOne(query);
            }


            if (user) {
                const isPinValid = await bcrypt.compare(password, user.password);
                if (isPinValid) {
                    // console.log('User exists:', user);

                    const token = jwt.sign({ email: user.email }, SECRET_KEY, { expiresIn: '1h' });
                    res.json({ token, user });


                    // return res.send({ user: true, pin: true, type: user.type });
                } else {
                    console.log('Invalid pin');
                    return res.send({ user: true, pin: false });
                }
            } else {
                console.log('User does not exist');
                return res.send({ user: false });
            }

        })






        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Ukil-server is on');
})

app.listen(port, () => {
    console.log(`Ukil-server is on port ${port}`);
})