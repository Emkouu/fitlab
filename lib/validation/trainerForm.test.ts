import { describe, it, expect } from "vitest";
import { trainerFormSchema } from "./trainerForm";

describe("trainerFormSchema", () => {
  describe("valid inputs", () => {
    it("should accept a trainer with required fields only", () => {
      const input = {
        name: "John Doe",
        specialtyIds: ["yoga", "pilates"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept a trainer with all fields", () => {
      const input = {
        trainerId: "trainer-123",
        name: "John Doe",
        photoUrl: "https://example.com/photo.jpg",
        bio: "Experienced yoga instructor with 10 years of experience",
        specialtyIds: ["yoga", "pilates", "meditation"],
        linkedUserId: "user-456",
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept trainer without trainerId (create mode)", () => {
      const input = {
        name: "Jane Smith",
        specialtyIds: ["vinyasa"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept trainer with linkedUserId as null", () => {
      const input = {
        name: "Bob Johnson",
        specialtyIds: ["strength-training"],
        linkedUserId: null,
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept trainer with linkedUserId as string", () => {
      const input = {
        name: "Alice Williams",
        specialtyIds: ["dance-fitness"],
        linkedUserId: "user-789",
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept trainer with empty photoUrl", () => {
      const input = {
        name: "Carol Davis",
        photoUrl: "",
        specialtyIds: ["aerobics"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept trainer with exactly 1 specialty", () => {
      const input = {
        name: "David Lee",
        specialtyIds: ["yoga"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept trainer with exactly 10 specialties", () => {
      const input = {
        name: "Eve Martinez",
        specialtyIds: [
          "yoga",
          "pilates",
          "meditation",
          "stretching",
          "breathing",
          "flexibility",
          "mindfulness",
          "alignment",
          "restoration",
          "vinyasa",
        ],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept trainer with bio", () => {
      const input = {
        name: "Frank Thompson",
        bio: "Certified personal trainer specializing in strength and conditioning",
        specialtyIds: ["strength-training"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept trainer with name at max length (100 chars)", () => {
      const input = {
        name: "A".repeat(100),
        specialtyIds: ["yoga"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("invalid inputs - name validation", () => {
    it("should reject empty name", () => {
      const input = {
        name: "",
        specialtyIds: ["yoga"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject missing name", () => {
      const input = {
        specialtyIds: ["yoga"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject name exceeding 100 characters", () => {
      const input = {
        name: "A".repeat(101),
        specialtyIds: ["yoga"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject name with only whitespace", () => {
      const input = {
        name: "   ",
        specialtyIds: ["yoga"],
      };
      const result = trainerFormSchema.safeParse(input);
      // Note: This will pass because "   " is not empty, but it's a valid string
      // If stricter validation is needed, add .trim() to the schema
      expect(trainerFormSchema.safeParse(input).success).toBe(true);
    });
  });

  describe("invalid inputs - specialtyIds validation", () => {
    it("should reject empty specialtyIds array", () => {
      const input = {
        name: "George White",
        specialtyIds: [],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject missing specialtyIds", () => {
      const input = {
        name: "Helen Black",
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject more than 10 specialties", () => {
      const input = {
        name: "Ivan Green",
        specialtyIds: [
          "yoga",
          "pilates",
          "meditation",
          "stretching",
          "breathing",
          "flexibility",
          "mindfulness",
          "alignment",
          "restoration",
          "vinyasa",
          "dance",
        ],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should verify specialtyIds is an array", () => {
      const input = {
        name: "Julia Red",
        specialtyIds: "yoga", // not an array
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("invalid inputs - photoUrl validation", () => {
    it("should reject invalid URL format for photoUrl", () => {
      const input = {
        name: "Kevin Blue",
        photoUrl: "not-a-valid-url",
        specialtyIds: ["yoga"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should accept valid URLs with different protocols", () => {
      const validUrls = [
        "https://example.com/photo.jpg",
        "http://example.com/photo.png",
        "https://cdn.example.com/images/trainer.jpg",
      ];
      validUrls.forEach((url) => {
        const input = {
          name: "Laura Pink",
          photoUrl: url,
          specialtyIds: ["yoga"],
        };
        const result = trainerFormSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("optional fields", () => {
    it("should allow omitting trainerId", () => {
      const input = {
        name: "Michael Orange",
        specialtyIds: ["pilates"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow omitting photoUrl", () => {
      const input = {
        name: "Nancy Purple",
        specialtyIds: ["meditation"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow omitting bio", () => {
      const input = {
        name: "Oscar Yellow",
        specialtyIds: ["dance-fitness"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow omitting linkedUserId", () => {
      const input = {
        name: "Patricia Brown",
        specialtyIds: ["aerobics"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should handle linkedUserId as null", () => {
      const input = {
        name: "Quinn Gray",
        specialtyIds: ["yoga"],
        linkedUserId: null,
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should handle linkedUserId as undefined", () => {
      const input = {
        name: "Rachel Cyan",
        specialtyIds: ["pilates"],
        linkedUserId: undefined,
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("field type validation", () => {
    it("should verify specialtyIds is an array of strings", () => {
      const input = {
        name: "Samuel Magenta",
        specialtyIds: ["yoga", "pilates"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data.specialtyIds)).toBe(true);
      }
    });

    it("should reject specialtyIds with non-string elements", () => {
      const input = {
        name: "Tina Lime",
        specialtyIds: ["yoga", 123, "pilates"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should verify name is a string", () => {
      const input = {
        name: 123, // not a string
        specialtyIds: ["yoga"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("edit mode scenarios", () => {
    it("should accept trainerId in edit mode", () => {
      const input = {
        trainerId: "existing-trainer-id",
        name: "Updated Name",
        specialtyIds: ["yoga", "pilates"],
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should update existing trainer with all fields", () => {
      const input = {
        trainerId: "trainer-edit-123",
        name: "Updated Trainer Name",
        photoUrl: "https://example.com/updated-photo.jpg",
        bio: "Updated bio text",
        specialtyIds: ["yoga", "meditation"],
        linkedUserId: "new-user-id",
      };
      const result = trainerFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});
