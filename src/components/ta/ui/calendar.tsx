import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ta/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("ta-ui-calendar p-3", className)}
      classNames={{
        months: "ta-ui-calendar-months flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "ta-ui-calendar-month space-y-4",
        caption: "ta-ui-calendar-caption flex justify-center pt-1 relative items-center",
        caption_label: "ta-ui-calendar-caption-label text-sm font-medium",
        nav: "ta-ui-calendar-nav space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "ta-ui-calendar-nav-button h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "ta-ui-calendar-nav-button-prev absolute left-1",
        nav_button_next: "ta-ui-calendar-nav-button-next absolute right-1",
        table: "ta-ui-calendar-table w-full border-collapse space-y-1",
        head_row: "ta-ui-calendar-head-row flex",
        head_cell: "ta-ui-calendar-head-cell text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "ta-ui-calendar-row flex w-full mt-2",
        cell: "ta-ui-calendar-cell h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "ta-ui-calendar-day h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected: "ta-ui-calendar-day-selected " +
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "ta-ui-calendar-day-today bg-accent text-accent-foreground",
        day_outside: "ta-ui-calendar-day-outside " +
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "ta-ui-calendar-day-disabled text-muted-foreground opacity-50",
        day_range_middle: "ta-ui-calendar-day-range-middle aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "ta-ui-calendar-day-hidden invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
