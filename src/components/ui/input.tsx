import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const isSearchByPlaceholder =
      typeof props.placeholder === "string" && props.placeholder.toLowerCase().includes("search");
    const marker = props["data-search-input"];
    const isSearchByMarker = marker !== undefined && marker !== false && marker !== "false";
    const isSearchInput = isSearchByPlaceholder || isSearchByMarker;

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          isSearchInput && "border-primary/70 ring-1 ring-primary/45 focus-visible:ring-primary",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
