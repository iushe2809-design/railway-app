import { useState } from "react";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Light-themed date picker that returns an ISO date string (YYYY-MM-DD).
 * Props: value (YYYY-MM-DD | ""), onChange(YYYY-MM-DD | ""), placeholder, testid, max (YYYY-MM-DD)
 */
export default function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  testid,
  max,
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const maxDate = max ? parse(max, "yyyy-MM-dd", new Date()) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-testid={testid}
          className="w-full justify-start h-10 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900 border-slate-200 font-normal"
        >
          <CalendarIcon className="w-4 h-4 mr-2 text-slate-500" />
          {selected ? (
            <span>{format(selected, "PPP")}</span>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }
              }}
              className="ml-auto text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
              data-testid={testid ? `${testid}-clear` : undefined}
              aria-label="Clear date"
            >
              clear
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0 bg-white text-slate-900 border-slate-200 shadow-2xl"
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) {
              onChange(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
          disabled={maxDate ? { after: maxDate } : undefined}
          initialFocus
          className="bg-white text-slate-900"
          classNames={{
            caption_label: "text-sm font-medium text-slate-900",
            head_cell: "text-slate-500 rounded-md w-8 font-normal text-[0.8rem]",
            nav_button:
              "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-md",
            day: "h-8 w-8 p-0 font-normal text-slate-900 hover:bg-slate-100 hover:text-slate-900 rounded-md",
            day_selected:
              "bg-blue-600 text-white hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white",
            day_today: "bg-slate-100 text-slate-900",
            day_outside: "text-slate-400",
            day_disabled: "text-slate-300 opacity-50",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
