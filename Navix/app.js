const express = require("express");
const app = express();
const ejsMate = require("ejs-mate");
const path = require("path");

app.set("view engine","ejs");
app.engine("ejs",ejsMate);
app.set("views",path.join(__dirname,"views"));

app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname,"public")));

let port = 8080;
app.listen(port,()=>{
  console.log("Server is running at port ",port);
})

app.get("/",(req,res)=>{
  res.render("parts/home.ejs");
})

app.get("/login",(req,res)=>{
  res.render("parts/login.ejs");
})

app.get("/about",(req,res)=>{
  res.render("parts/about.ejs");
})