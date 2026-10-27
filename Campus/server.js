require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB...");
  })
  .catch((e) => {
    console.log("MongoDB connection error:", e.message);
  });

function calc(p, d){
  if (!d){
    return p;

  }
  if (d === "CAMPUS50") {
    return p * 0.5;
  }

  if (d === "EARLYBIRD") {
    return Math.max(0, p - 100);
  }
  throw new Error("Invalid discount code");
}
const sch = new mongoose.Schema({
  studentName: {
    type: String,
    required: [true, "Student name is required"],
    trim: true,
    minlength: [3, "Student name must be at least 3 characters"],
    maxlength: [50, "Student name cannot exceed 50 characters"],
  },

  collegeEmail: {
    type: String,
    required: [true, "College email is required"],
    unique: true,
    trim: true,
    lowercase: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(edu|ac\.in)$/i,
      "Must be a valid college email ending in .edu or .ac.in",
    ],
  },

  rollNumber: {
    type: String,
    required: [true, "Roll number is required"],
    uppercase: true,
    trim: true,
    match: [
      /^[A-Z0-9]{8,10}$/,
      "Roll number must be contain 8 to 10 alphanumeric characters",
    ],
  },

  eventType: {
    type: String,
    required: [true, "Event type is required"],
    enum: {
      values: [
        "CODING_HACKATHON",
        "AI_WORKSHOP",
        "ROBOTICS",
        "GAMING",
      ],
      message: "Invalid event type",
    },
  },

  teamSize: {
    type: Number,
    required: [true, "Team size is required"],
    min: [1, "Team size must be at least 1"],
    max: [4, "Team size cannot exceed 4"],
    validate: {
      validator: Number.isInteger,
      message: "Team size must be an integer",
    },
  },

  ticketPrice: {
    type: Number,
    required: [true, "Ticket price is required"],
    min: [0, "Ticket price cannot be negative"],
  },
  discountCode: {
    type: String,
    trim: true,
    uppercase: true,
    validate: {
      validator: function (v) {
        return (
          v == null ||
          v === "" ||
          ["CAMPUS50", "EARLYBIRD"].includes(v)
        );
      },
      message: "Invalid discount code",
    },
  },

  finalAmount: {
    type: Number,
    required: true,
    min: [0, "Final amount cannot be negative"],
  },

  status: {
    type: String,
    enum: {
      values: ["PENDING", "CONFIRMED", "CANCELLED"],
      message: "Invalid registration status",
    },
    default: "PENDING",
  },
  registrationDate: {
    type: Date,
    default: Date.now,
    validate: {
      validator: function (v) {
        return v <= new Date();
      },
      message: "Registration date cannot be in the future",
    },
  },
});
sch.pre("validate", function () {
  if (this.eventType === "AI_WORKSHOP" && this.teamSize !== 1) {
    this.invalidate(
      "teamSize",
      "AI Workshop only permits individual registrations"
    );
  }
});
const Reg = mongoose.model("Registration",sch);
function err(e, s) {
  if (e.code === 11000) {
    return s.status(409).json({
      success: false,
      message: "This email is already registered for the event",
    });
  }
  if (e.name === "ValidationError") {
    const a = Object.values(e.errors).map((x) => x.message);
    return s.status(400).json({
      success: false,
      message: "Validation failed",
      errors: a,
    });
  }
  if (e.name === "CastError") {
    return s.status(400).json({
      success: false,
      message: "Invalid registration ID format",
    });
  }

  if (e.message === "Invalid Discount Code") {
    return s.status(400).json({
      success: false,
      message: "Invalid discount code",
    });
  }

  console.error(e);

  return s.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
}

function chk(id) {
  return mongoose.isValidObjectId(id);
}

app.post("/api/registrations", async (r, s) => {
  try {
    const b = { ...r.body };

    b.finalAmount = calc(b.ticketPrice, b.discountCode);

    const reg = await Reg.create(b);
    return s.status(201).json({
      success: true,
      message: "Registration successful",
      data: reg,
    });
  } catch (e) {
    return err(e, s);
  }
});

app.get("/api/registrations", async (r, s) => {
  try {
    const f = {};

    if (r.query.eventType) {
      f.eventType = r.query.eventType;
    }

    if (r.query.status) {
      f.status = r.query.status;
    }

    const a = await Reg.find(f);
    return s.status(200).json({
      success: true,
      count: a.length,
      data: a,
    });
  } catch (e) {
    return err(e, s);
  }
});
app.get("/api/registrations/:id", async (r, s) => {
  try {
    if (!chk(r.params.id)) {
      return s.status(400).json({
        success: false,
        message: "Invalid registration ID format",
      });
    }

    const reg = await Reg.findById(r.params.id);

    if (!reg) {
      return s.status(404).json({
        success: false,
        message: "Registration not found",
      });
    }
    return s.status(200).json({
      success: true,
      data: reg,
    });
  } catch (e) {
    return err(e, s);
  }
});
app.put("/api/registrations/:id", async (r, s) => {
  try {
    if (!chk(r.params.id)) {
      return s.status(400).json({
        success: false,
        message: "Invalid registration ID format",
      });
    }
    const old = await Reg.findById(r.params.id);

    if (!old) {
      return s.status(404).json({
        success: false,
        message: "Registration not found",
      });
    }
    const u = { ...r.body };
    delete u.finalAmount;
    delete u._id;
    delete u.__v;

    const et = u.eventType ?? old.eventType;
    const ts = u.teamSize ?? old.teamSize;

    if (et === "AI_WORKSHOP" && ts !== 1) {
      return s.status(400).json({
        success: false,
        message: "AI Workshop only permits individual registrations",
      });
    }

    const tp = u.ticketPrice ?? old.ticketPrice;

    const dc =
      u.discountCode !== undefined
        ? u.discountCode
        : old.discountCode;

    u.finalAmount = calc(tp, dc);

    const reg = await Reg.findByIdAndUpdate(
      r.params.id,
      { $set: u },
      {
        new: true,
        runValidators: true,
        context: "query",
      }
    );

    return s.status(200).json({
      success: true,
      message: "Registration updated successfully",
      data: reg,
    });
  } catch (e) {
    return err(e, s);
  }
});

app.delete("/api/registrations/:id", async (r, s) => {
  try {
    if (!chk(r.params.id)) {
      return s.status(400).json({
        success: false,
        message: "Invalid registration ID format",
      });
    }

    const reg = await Reg.findByIdAndDelete(r.params.id);

    if (!reg) {
      return s.status(404).json({
        success: false,
        message: "Registration not found",
      });
    }

    return s.status(200).json({
      success: true,
      message: "Registration deleted successfully",
    });
  } catch (e) {
    return err(e, s);
  }
});

app.use((e, r, s, n) => {
  if (
    e instanceof SyntaxError &&
    e.status === 400 &&
    "body" in e
  ) {
    return s.status(400).json({
      success: false,
      message: "Invalid JSON request body",
    });
  }

  n(e);
});
app.get("/api", (r, s) => {
  s.json({ message: "Hello backend!" });
});

mongoose.connection.once("open",() =>{
  app.listen(port, () =>{
    console.log(`Server Started on Port NUmber ${port}`);
  });

});
