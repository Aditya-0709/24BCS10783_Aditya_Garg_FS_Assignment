require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB...");
  })
  .catch((err) => {
    console.log("MongoDB connection error:", err.message);
  });

function calculateFinalAmount(ticketPrice, discountCode) {
  if (!discountCode) {
    return ticketPrice;
  }

  if (discountCode === "CAMPUS50") {
    return ticketPrice * 0.5;
  }

  if (discountCode === "EARLYBIRD") {
    return Math.max(0, ticketPrice - 100);
  }

  throw new Error("Invalid discount code");
}


const registrationSchema = new mongoose.Schema({
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
      "Roll number must contain 8 to 10 alphanumeric characters",
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
      validator: function (value) {
        return (
          value == null ||
          value === "" ||
          ["CAMPUS50", "EARLYBIRD"].includes(value)
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
      validator: function (value) {
        return value <= new Date();
      },
      message: "Registration date cannot be in the future",
    },
  },
});

registrationSchema.pre("validate", function () {
  if (this.eventType === "AI_WORKSHOP" && this.teamSize !== 1) {
    this.invalidate(
      "teamSize",
      "AI Workshop only permits individual registrations"
    );
  }
});

const Registration = mongoose.model(
  "Registration",
  registrationSchema
);


function handleError(err, res) {
  // Duplicate unique email
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "This email is already registered for the event",
    });
  }
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map(
      (error) => error.message
    );

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid registration ID format",
    });
  }

  if (err.message === "Invalid discount code") {
    return res.status(400).json({
      success: false,
      message: "Invalid discount code",
    });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}


function isValidId(id) {
  return mongoose.isValidObjectId(id);
}
app.post("/api/registrations", async (req, res) => {
  try {
    const body = { ...req.body };

    body.finalAmount = calculateFinalAmount(

      body.ticketPrice,
      body.discountCode

    );

    const registration = await Registration.create(body);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: registration,
    });
  } catch (err) {
    return handleError(err, res);
  }
});
a
app.get("/api/registrations", async (req, res) => {
  try {
    const filter = {};

    if (req.query.eventType) {
      filter.eventType = req.query.eventType;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const registrations = await Registration.find(filter);

    return res.status(200).json({
      success: true,
      count: registrations.length,
      data: registrations,
    });
  } catch (err) {
    return handleError(err, res);
  }
});

app.get("/api/registrations/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration ID format",
      });
    }

    const registration = await Registration.findById(req.params.id);

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: "Registration not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: registration,
    });
  } catch (err) {
    return handleError(err, res);
  }
});

app.put("/api/registrations/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration ID format",
      });
    }

    const existing = await Registration.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Registration not found",
      });
    }

    const updates = { ...req.body };
    delete updates.finalAmount;
    delete updates._id;
    delete updates.__v;
    const newEventType =
      updates.eventType ?? existing.eventType;

    const newTeamSize =
      updates.teamSize ?? existing.teamSize;

    if (newEventType === "AI_WORKSHOP" && newTeamSize !== 1) {
      return res.status(400).json({
        success: false,
        message: "AI Workshop only permits individual registrations",
      });
    }
    const newTicketPrice =
      updates.ticketPrice ?? existing.ticketPrice;

    const newDiscountCode =
      updates.discountCode !== undefined
        ? updates.discountCode
        : existing.discountCode;

    updates.finalAmount = calculateFinalAmount(
      newTicketPrice,
      newDiscountCode
    );

    const registration = await Registration.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
        context: "query",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Registration updated successfully",
      data: registration,
    });
  } catch (err) {
    return handleError(err, res);
  }
});
app.delete("/api/registrations/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration ID format",
      });
    }

    const registration = await Registration.findByIdAndDelete(
      req.params.id
    );

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: "Registration not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Registration deleted successfully",
    });
  } catch (err) {
    return handleError(err, res);
  }
});
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request body",
    });
  }

  next(err);
});

app.get("/api", (req, res) => {
  res.json({ message: "Hello backend!" });
});

mongoose.connection.once("open", () => {
  app.listen(port, () => {
    console.log(`Server started on port ${port}`);
  });
});
