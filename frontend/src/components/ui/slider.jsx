import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  ...props
}) {
  const normalizedValue = value !== undefined
    ? (Array.isArray(value) ? value : [value])
    : undefined;

  const normalizedDefaultValue = defaultValue !== undefined
    ? (Array.isArray(defaultValue) ? defaultValue : [defaultValue])
    : undefined;

  const count = normalizedValue?.length || normalizedDefaultValue?.length || 1;

  const handleValueChange = (val, details) => {
    if (onValueChange) {
      const arr = Array.isArray(val) ? val : [val];
      onValueChange(arr, details);
    }
  };

  return (
    <SliderPrimitive.Root
      className={cn("relative flex w-full touch-none select-none items-center py-2", className)}
      data-slot="slider"
      defaultValue={normalizedDefaultValue}
      value={normalizedValue}
      min={min}
      max={max}
      step={step}
      onValueChange={handleValueChange}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full items-center">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="absolute h-full bg-primary rounded-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: count }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            index={index}
            className="block h-5 w-5 rounded-full border-2 border-primary bg-background shadow-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing hover:scale-110"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }

