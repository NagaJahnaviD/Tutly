import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import type { Attendance, Class, submission, User } from "@prisma/client";

interface AttendanceWithClass extends Attendance {
  class: {
    createdAt: Date;
  };
}

interface SubmissionWithPoints extends submission {
  points: { score: number }[];
}

export const statisticsRouter = createTRPCRouter({
  getPiechartData: protectedProcedure
    .input(
      z.object({
        courseId: z.string(),
        mentorUsername: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        return null;
      }
      try {
        let assignments: SubmissionWithPoints[] | undefined;
        let noOfTotalMentees: number | undefined;
        if (currentUser.role === "MENTOR" || input.mentorUsername !== null) {
          assignments = await db.submission.findMany({
            where: {
              enrolledUser: {
                mentorUsername: input.mentorUsername ?? currentUser.username,
                courseId: input.courseId,
              },
            },
            include: {
              points: true,
            },
          });
          noOfTotalMentees = await db.enrolledUsers.count({
            where: {
              mentorUsername: input.mentorUsername ?? currentUser.username,
              courseId: input.courseId,
            },
          });
        } else if (currentUser.role === "INSTRUCTOR") {
          assignments = await db.submission.findMany({
            where: {
              assignment: {
                courseId: input.courseId,
              },
            },
            include: {
              points: true,
            },
          });
          noOfTotalMentees = await db.enrolledUsers.count({
            where: {
              courseId: input.courseId,
              user: {
                role: "STUDENT",
              },
            },
          });
        }
        let assignmentsWithPoints = 0,
          assignmentsWithoutPoints = 0;
        assignments?.forEach((assignment) => {
          if (assignment.points.length > 0) {
            assignmentsWithPoints += 1;
          } else {
            assignmentsWithoutPoints += 1;
          }
        });
        const noOfTotalAssignments = await db.attachment.count({
          where: {
            attachmentType: "ASSIGNMENT",
            courseId: input.courseId,
          },
        });
        const notSubmitted =
          noOfTotalAssignments * (noOfTotalMentees ?? 0) -
          assignmentsWithPoints -
          assignmentsWithoutPoints;

        return [assignmentsWithPoints, assignmentsWithoutPoints, notSubmitted];
      } catch (e) {
        return { error: "Failed to fetch pichart data", details: String(e) };
      }
    }),

  getLinechartData: protectedProcedure
    .input(
      z.object({
        courseId: z.string(),
        menteesCount: z.number(),
        mentorUsername: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        return null;
      }
      try {
        let attendance: AttendanceWithClass[] = [];
        if (currentUser.role === "MENTOR" || input.mentorUsername !== null) {
          attendance = await db.attendance.findMany({
            where: {
              user: {
                enrolledUsers: {
                  some: {
                    mentorUsername:
                      input.mentorUsername ?? currentUser.username,
                  },
                },
              },
              attended: true,
              class: {
                course: {
                  id: input.courseId,
                },
              },
            },
            include: {
              class: {
                select: {
                  createdAt: true,
                },
              },
            },
          });
        } else if (currentUser.role === "INSTRUCTOR") {
          attendance = await db.attendance.findMany({
            where: {
              attended: true,
              class: {
                courseId: input.courseId,
              },
            },
            include: {
              class: {
                select: {
                  createdAt: true,
                },
              },
            },
          });
        }
        const getAllClasses = await db.class.findMany({
          where: {
            courseId: input.courseId,
          },
          select: {
            id: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        });
        const classes: string[] = [];
        const attendanceInEachClass: number[] = [];
        getAllClasses.forEach((classData) => {
          classes.push(classData.createdAt.toISOString().split("T")[0] ?? "");
          const tem = attendance.filter(
            (attendanceData) => attendanceData.classId === classData.id,
          );
          attendanceInEachClass.push(tem?.length ?? 0);
        });
        const linechartData = [];
        for (let i = 0; i < classes.length; i++) {
          linechartData.push({
            class: classes[i],
            attendees: attendanceInEachClass[i],
            absentees: input.menteesCount - (attendanceInEachClass[i] ?? 0),
          });
        }
        return linechartData ?? [];
      } catch (e) {
        return { error: "Failed to fetch linechart data", details: String(e) };
      }
    }),

  getBarchartData: protectedProcedure
    .input(
      z.object({
        courseId: z.string(),
        mentorUsername: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        return null;
      }
      try {
        let submissionCount;
        if (currentUser.role === "MENTOR" || input.mentorUsername !== null) {
          submissionCount = await db.attachment.findMany({
            where: {
              attachmentType: "ASSIGNMENT",
              courseId: input.courseId,
            },
            include: {
              submissions: {
                where: {
                  enrolledUser: {
                    mentorUsername:
                      input.mentorUsername ?? currentUser.username,
                  },
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          });
        } else if (currentUser.role === "INSTRUCTOR") {
          submissionCount = await db.attachment.findMany({
            where: {
              attachmentType: "ASSIGNMENT",
              courseId: input.courseId,
            },
            include: {
              submissions: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          });
        }
        const assignments: string[] = [];
        const countForEachAssignment: number[] = [];
        submissionCount?.forEach((submission) => {
          assignments.push(submission.title);
          countForEachAssignment.push(submission.submissions.length);
        });
        const barchartData = [];
        for (let i = 0; i < assignments.length; i++) {
          barchartData.push({
            assignment: assignments[i],
            submissions: countForEachAssignment[i],
          });
        }
        return barchartData ?? [];
      } catch (e) {
        return { error: "Failed to fetch barchart data", details: String(e) };
      }
    }),

  getAllMentees: protectedProcedure
    .input(
      z.object({
        courseId: z.string(),
        mentorUsername: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        return { error: "Unauthorized" };
      }
      try {
        let students: User[] | undefined;
        if (currentUser.role === "MENTOR" || input.mentorUsername !== null) {
          students = await db.user.findMany({
            where: {
              enrolledUsers: {
                some: {
                  course: {
                    id: input.courseId,
                  },
                  mentorUsername: input.mentorUsername ?? currentUser.username,
                },
              },
              role: "STUDENT",
              organizationId: currentUser.organizationId,
            },
            include: {
              course: true,
              enrolledUsers: true,
            },
          });
        } else if (currentUser.role === "INSTRUCTOR") {
          students = await db.user.findMany({
            where: {
              enrolledUsers: {
                some: {
                  course: {
                    id: input.courseId,
                  },
                },
              },
              role: "STUDENT",
              organizationId: currentUser.organizationId,
            },
            include: {
              course: true,
              enrolledUsers: true,
            },
          });
        }

        return students ?? [];
      } catch (e) {
        return { error: "Failed to fetch barchart data", details: String(e) };
      }
    }),

  getAllMentors: protectedProcedure
    .input(
      z.object({
        courseId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        return { error: "Unauthorized" };
      }
      try {
        const mentors = await db.user.findMany({
          where: {
            enrolledUsers: {
              some: {
                course: {
                  id: input.courseId,
                },
              },
            },
            role: "MENTOR",
            organizationId: currentUser.organizationId,
          },
          include: {
            course: true,
            enrolledUsers: true,
          },
        });

        return mentors;
      } catch (e) {
        return { error: "Failed to fetch barchart data", details: String(e) };
      }
    }),

  studentBarchartData: protectedProcedure
    .input(
      z.object({
        courseId: z.string(),
        studentUsername: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        return null;
      }
      try {
        let assignments = await db.submission.findMany({
          where: {
            enrolledUser: {
              username: input.studentUsername ?? currentUser.username,
            },
            assignment: {
              courseId: input.courseId,
            },
          },
          include: {
            points: true,
          },
        });
        let totalPoints = 0;
        const tem = assignments;
        assignments = assignments.filter(
          (assignment) => assignment.points.length > 0,
        );
        const underReview = tem.length - assignments.length;
        assignments.forEach((assignment) => {
          assignment.points.forEach((point) => {
            totalPoints += point.score;
          });
        });
        const noOfTotalAssignments = await db.attachment.findMany({
          where: {
            attachmentType: "ASSIGNMENT",
            courseId: input.courseId,
          },
        });
        let totalAssignments = 0;
        noOfTotalAssignments.forEach((assignment) => {
          totalAssignments += assignment.maxSubmissions ?? 0;
        });
        return {
          evaluated: assignments.length ?? 0,
          unreviewed: underReview,
          unsubmitted: totalAssignments - assignments.length - underReview,
          totalPoints: totalPoints,
        };
      } catch (e) {
        return { error: "Failed to fetch barchart data", details: String(e) };
      }
    }),

  studentHeatmapData: protectedProcedure
    .input(
      z.object({
        courseId: z.string(),
        studentUsername: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        return null;
      }
      try {
        const attendance = await db.attendance.findMany({
          where: {
            username: input.studentUsername ?? currentUser.username,
            AND: {
              class: {
                course: {
                  id: input.courseId,
                },
              },
            },
          },
          select: {
            class: {
              select: {
                createdAt: true,
              },
            },
          },
        });
        const attendanceDates: string[] = [];
        attendance.forEach((attendanceData) => {
          attendanceDates.push(
            attendanceData.class.createdAt.toISOString().split("T")[0] ?? "",
          );
        });

        const getAllClasses = await db.class.findMany({
          where: {
            courseId: input.courseId,
            Attendence: {
              some: {},
            },
          },
          select: {
            id: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        });
        const classes: string[] = [];
        getAllClasses.forEach((classData) => {
          classes.push(classData.createdAt.toISOString().split("T")[0] ?? "");
        });
        return { classes, attendanceDates };
      } catch (e) {
        return { error: "Failed to fetch barchart data", details: String(e) };
      }
    }),
});
