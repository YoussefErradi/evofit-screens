package com.evofit;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class OperatingCalendar {
  public static final ZoneId ZONE = ZoneId.of("Africa/Casablanca");
  private final Set<DayOfWeek> openDays;
  private final LocalTime opensAt;
  private final LocalTime closesAt;

  public OperatingCalendar(@Value("${evofit.open-days}") String days,
                           @Value("${evofit.open-time}") String opensAt,
                           @Value("${evofit.close-time}") String closesAt) {
    List<DayOfWeek> parsed = Arrays.stream(days.split(","))
        .map(String::trim).map(String::toUpperCase).map(DayOfWeek::valueOf).toList();
    if (parsed.isEmpty()) throw new IllegalArgumentException("At least one operating day is required");
    this.openDays = EnumSet.copyOf(parsed);
    this.opensAt = LocalTime.parse(opensAt);
    this.closesAt = LocalTime.parse(closesAt);
    if (!this.closesAt.isAfter(this.opensAt))
      throw new IllegalArgumentException("Closing time must be after opening time");
  }

  public boolean isOperatingDay(LocalDate date) { return openDays.contains(date.getDayOfWeek()); }

  public LocalDate nextOperatingDay(LocalDate from) {
    LocalDate date = from;
    while (!isOperatingDay(date)) date = date.plusDays(1);
    return date;
  }

  public List<LocalDate> cycleDates(LocalDate from) {
    java.util.ArrayList<LocalDate> dates = new java.util.ArrayList<>();
    LocalDate cursor = nextOperatingDay(from);
    while (dates.size() < 8) {
      if (isOperatingDay(cursor)) dates.add(cursor);
      cursor = cursor.plusDays(1);
    }
    return dates;
  }

  public boolean isOpen(ZonedDateTime now) {
    ZonedDateTime local = now.withZoneSameInstant(ZONE);
    return isOperatingDay(local.toLocalDate())
        && !local.toLocalTime().isBefore(opensAt)
        && local.toLocalTime().isBefore(closesAt);
  }

  public LocalTime opensAt() { return opensAt; }
  public LocalTime closesAt() { return closesAt; }
  public Set<DayOfWeek> openDays() { return Set.copyOf(openDays); }
}
