//load modules
const express = require('express');
const exphbs = require('express-handlebars');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const formidable =require('formidable');
const handlebars = require('handlebars');
const {allowInsecurePrototypeAccess} = require('@handlebars/allow-prototype-access');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
//create port
const port = process.env.PORT || 3000;
//init app
const app = express();
//setup body parser middlileware
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());
//configuraiton for auth
app.use(cookieParser());
app.use(session({
    secret: 'mysecret',
    resave:true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
//load helpers
const {requireLogin,ensureGuest} = require('./helpers/authHelper');
const {upload} = require('./helpers/aws');
//load passports
require('./passport/local');
require('./passport/facebook');
//make user as a global object
app.use((req,res, next)=>{
    res.locals.user = req.user || null;
    next();
});
//load files
const keys = require('./config/keys');
//load collections
const User = require('./models/user');
const Contact = require('./models/contact');
const Car = require('./models/car');
//connect to mongodb
mongoose.connect(keys.MongoDB, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then((result) => app.listen(3001))
  .catch((err) => console.log(err))
  console.log("Server Başarıyla Başlatıldı!")

//setup view engine
app.engine('handlebars',exphbs({
    defaultLayout:'main',
    handlebars: allowInsecurePrototypeAccess(handlebars)
}));
app.set('view engine','handlebars');
//connect client side to serve css and js files
app.use(express.static('public'));

//handle home route
app.get('/',ensureGuest,(req,res) =>{
    res.render('home');
});
app.get('/about',ensureGuest,(req,res)=>{
    res.render('about',{
        title:'About'
    });
});
app.get('/contact',requireLogin,(req,res) => {
    res.render('contact',{
        title:'Contact us'
    });
});
//SAVE CONTACT FORM DATA
app.post('/contact',requireLogin,(req,res) => {
    console.log(req.body);
    const newContact = {   
        name: req.user._id,
        message: req.body.message
    }
    new Contact(newContact).save((err,user) =>{
        if (err) {
            throw err;
        } else {
            console.log('We Received message from user',user);
        }
    });
});
app.get('/signup',ensureGuest,(req,res) => {
    res.render('signupForm',{
        title:'Register'
    });
});
app.post('/signup',ensureGuest,(req,res)=>{
    console.log(req.body);
    let errors = [];
    if (req.body.password !== req.body.password2) {
        errors.push({text:'Password Not match'});
    }
    if (req.body.password.length < 5 ) {
        errors.push({text:'Password must  be at least 5 characters!'});
    }
    if (errors.length > 0) {
        res.render('signupForm', {
            errors:errors,
            firstname: req.body.firstname,
            lastname: req.body.lastname,
            password: req.body.password,
            password2:req.body.password2,
            email: req.body.email
        })   
    }else{
       User.findOne({email:req.body.email})
       .then((user) =>{
        if (user) {
            let errors =[];
            errors.push({text:'Email already exist!'});
            res.render('signupForm',{
                errors:errors,
                firstname: req.body.firstname,
                lastname: req.body.lastname,
                password: req.body.password,
                password2:req.body.password2,
                email: req.body.email
            });
        }else{
            //encrypt password
            let salt = bcrypt.genSaltSync(10);
            let hash = bcrypt.hashSync(req.body.password,salt);

            const newUser = {
                firstname: req.body.firstname,
                lastname: req.body.lastname,
                email: req.body.email,
                password: hash
            }
            new User(newUser).save((err,user)=>{
                if (err) {
                    throw err;
                }
                if (user) {
                    let success =[];
                    success.push({text:'You successfully creted an account'});
                    res.render('loginForm',{
                        success:success
                    })     
                }
            })
        }
       })
    }
});
app.get('/displayLoginForm',ensureGuest,(req,res)=>{
    res.render('loginForm',{
        title: 'Login'
    });
});
//passport authentication
app.post('/login', passport.authenticate('local',{
    successRedirect:'/profile',
    failureRedirect:'/loginErrors'
}));
app.get('/auth/facebook',passport.authenticate('facebook',{
    scope:['email']
}));
app.get('/auth/facebook/callback',passport.authenticate('facebook',{
    successRedirect: '/profile',
    failureRedirect:'/'
}));
//display profile
app.get('/profile',requireLogin,(req,res)=>{
    User.findById({_id:req.user._id})
    .then((user)=>{
        user.online= true;
        user.save((err,user)=>{
            if (err) {
                throw err;
            }
            if (user) {
                res.render('profile',{
                    user:user,
                    title: 'Profile'
                });
            }
        })
    });
});
app.get('/loginErrors',(req,res) => {
    let errors =[];
    errors.push({text:'User not found or Password incorrect'});
    res.render('loginForm',{
        errors:errors,
        title: 'Error'
    });
});
//list a car route
app.get('/listCar',(requireLogin,(req,res)=>{
    res.render('listCar',{
        title: 'Listing'
    });
}));
app.post('/listCar', requireLogin,(req,res)=>{
    const newCar = {
        owner: req.user_id,
        make: req.body.make,
        model: req.body.model,
        year: req.body.year,
        type: req.body.type
    }
    new Car(newCar).save((err,car) => {
        if (err) {
            throw err;
        }
        if (car) {
            res.render('listCar2',{
                title:'Finish',
                car:car
            });
        }
    })  
});
app.post('/listCar2', requireLogin,(req,res)=>{
 Car.findOne({_id:req.body.carID,owner:req.user._id})
 .then((car) =>{
    let imageUrl = {
        imageUrl: `https://car-rental-app1.s3.amazonaws.com/${req.body.image}`
    };
    car.pricePerWeek = req.body.pricePerWeek;
    car.pricePerHour= req.body.pricePerHour;
    car.location = req.body.location;
    car.image.push(imageUrl);
    car.save((err,car) =>{
        if (err) {
            throw err;  
        }
        if (car) {
            res.redirect('/showCars');
        }
    })
 })
});
app.get('/showCars',requireLogin,(req,res)=>{
    Car.find({})
    .populate('owner')
    .sort({date:'desc'})
    .then((cars)=>{
        res.render('showCars',{
            cars:cars
        })
    })
})
//receive image
app.post('/uploadImage',requireLogin,upload.any(),(req,res)=>{
    const form = new formidable.IncomingForm();
    form.on('file',(field,file)=>{
        console.log(file);
    });
    form.on('error',(err)=>{
        console.log(err);
    });
    form.on('end',()=>{
        console.log('Image received successfully');
    });
    form.parse(req);
});
//log user out
app.get('/logout',(req,res) =>{
    User.findById({_id:req.user._id})
    .then((user) => {
        user.online=false;
        user.save((err,user)=>{
           if (err) {
            throw err;
           } 
           if (user) {
            req.logout();
            res.redirect('/');
           }
        });
    });
});
app.listen(port,()=>{
    console.log(`server is running ${port}`);
});
