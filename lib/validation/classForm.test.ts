import { describe, it, expect } from "vitest";
import { classFormSchema } from "./classForm";
import { tomorrowSofiaDate } from "../format/sofiaTime";

describe("classFormSchema", () => {
  const tomorrow = tomorrowSofiaDate();
  const dayAfterTomorrow = new Date(tomorrow.getTime() + 86400000);

  describe("valid inputs", () => {
    it("should accept a complete valid class form", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept all valid time formats", () => {
      const validTimes = ["00:00", "08:30", "12:00", "18:30", "23:59"];
      validTimes.forEach((time) => {
        const input = {
          date: dayAfterTomorrow,
          time,
          duration: "60",
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: "20.00",
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("should accept valid EUR formats", () => {
      const validEurFormats = ["0", "15", "20.00", "0.50", "100.99"];
      validEurFormats.forEach((eur) => {
        const input = {
          date: dayAfterTomorrow,
          time: "18:30",
          duration: "60",
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: eur,
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("should accept all valid durations", () => {
      const validDurations = ["45", "55", "60", "70", "80", "90", "100", "120"];
      validDurations.forEach((duration) => {
        const input = {
          date: dayAfterTomorrow,
          time: "18:30",
          duration,
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: "20.00",
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("should accept 1 or 2 trainers", () => {
      const oneTrainer = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      expect(classFormSchema.safeParse(oneTrainer).success).toBe(true);

      const twoTrainers = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1", "trainer2"],
        capacity: 15,
        depositEur: "20.00",
      };
      expect(classFormSchema.safeParse(twoTrainers).success).toBe(true);
    });

    it("should accept capacity between 1 and 30", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        depositEur: "20.00",
      };
      for (let cap = 1; cap <= 30; cap++) {
        const result = classFormSchema.safeParse({ ...input, capacity: cap });
        expect(result.success).toBe(true);
      }
    });

    it("should accept optional classId, isSpecialEvent, and eventNotes", () => {
      const input = {
        classId: "existing-id",
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
        isSpecialEvent: true,
        eventNotes: "Special workshop",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("should reject past dates", () => {
      const input = {
        date: new Date(tomorrow.getTime() - 86400000), // yesterday
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject today's date", () => {
      const input = {
        date: new Date(), // today
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid time formats", () => {
      const invalidTimes = ["18:3", "18:300", "18-30", "1830", "1:30", "999:99"];
      invalidTimes.forEach((time) => {
        const input = {
          date: dayAfterTomorrow,
          time,
          duration: "60",
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: "20.00",
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    it("should reject invalid durations", () => {
      const invalidDurations = ["30", "50", "75", "110", "150", "1"];
      invalidDurations.forEach((duration) => {
        const input = {
          date: dayAfterTomorrow,
          time: "18:30",
          duration,
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: "20.00",
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    it("should reject invalid EUR formats", () => {
      const invalidEurs = ["20.5", "20.000", "abc", "20,00", "€20"];
      invalidEurs.forEach((eur) => {
        const input = {
          date: dayAfterTomorrow,
          time: "18:30",
          duration: "60",
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: eur,
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    it("should reject capacity < 1 or > 30", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        depositEur: "20.00",
      };
      expect(classFormSchema.safeParse({ ...input, capacity: 0 }).success).toBe(false);
      expect(classFormSchema.safeParse({ ...input, capacity: 31 }).success).toBe(false);
      expect(classFormSchema.safeParse({ ...input, capacity: -1 }).success).toBe(false);
      expect(classFormSchema.safeParse({ ...input, capacity: 100 }).success).toBe(false);
    });

    it("should reject 0 trainers", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: [],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject > 2 trainers", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1", "trainer2", "trainer3"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject empty practiceId", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject non-integer capacity", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15.5,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields", () => {
    it("should allow omitting classId", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow omitting eventNotes", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should default isSpecialEvent to false", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      if (result.success) {
        expect(result.data.isSpecialEvent).toBe(false);
      }
    });
  });
});
