import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ApiError } from "@/lib/api";
import {
  FormProvider,
  getBackendValidationSummary,
  getFormValidationMessage,
  useForm,
  useFormContext,
} from ".";

describe("form infrastructure", () => {
  test("exposes React Hook Form provider integration without product forms", () => {
    function FieldProbe() {
      const form = useFormContext<{ name: string }>();
      form.register("name");
      return <span>{form.getValues("name")}</span>;
    }

    function FormProbe() {
      const form = useForm<{ name: string }>({
        defaultValues: { name: "Hassan" },
      });

      return (
        <FormProvider {...form}>
          <FieldProbe />
        </FormProvider>
      );
    }

    render(<FormProbe />);

    expect(screen.getByText("Hassan")).toBeInTheDocument();
  });

  test("keeps reusable validation messages localized", () => {
    expect(getFormValidationMessage("en", "required")).toBe(
      "This field is required.",
    );
    expect(getFormValidationMessage("ar", "required")).toBe("هذا الحقل مطلوب.");
  });

  test("summarizes Backend validation errors without inventing field paths", () => {
    const error = new ApiError({
      category: "validation",
      code: "VALIDATION_FAILED",
      details: { issues: [{ path: ["name"], message: "Required" }] },
      kind: "backend",
      message: "Validation failed",
      status: 400,
    });

    expect(getBackendValidationSummary(error)).toEqual({
      code: "VALIDATION_FAILED",
      globalMessage: "Validation failed",
      rawDetails: { issues: [{ path: ["name"], message: "Required" }] },
    });
  });
});
