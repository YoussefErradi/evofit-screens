package com.evofit;

import static org.junit.jupiter.api.Assertions.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RotationServiceTest {
  @Test void eightDaysUseEachExerciseOnce() {
    List<UUID> exercises = new ArrayList<>();
    for (int i = 0; i < 16; i++) exercises.add(UUID.randomUUID());
    var days = RotationService.pairs(exercises, new Random(7));
    assertEquals(8, days.size());
    assertTrue(days.stream().allMatch(day -> day.size() == 2));
    assertEquals(16, days.stream().flatMap(List::stream).distinct().count());
    assertEquals(exercises.stream().sorted().toList(), days.stream().flatMap(List::stream).sorted().toList());
  }

  @Test void operatingDatesSkipSunday() {
    var calendar = new OperatingCalendar("MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY", "06:00", "22:00");
    var dates = calendar.cycleDates(LocalDate.of(2026, 10, 16));
    assertEquals(8, dates.size());
    assertEquals(LocalDate.of(2026, 10, 16), dates.getFirst());
    assertEquals(LocalDate.of(2026, 10, 24), dates.getLast());
    assertTrue(dates.stream().noneMatch(d -> d.getDayOfWeek().name().equals("SUNDAY")));
  }

  @Test void threeRoundsHaveIndependentFullCycles() {
    for (int round = 0; round < 3; round++) {
      List<UUID> exercises = new ArrayList<>();
      for (int i = 0; i < 16; i++) exercises.add(UUID.randomUUID());
      for (int cycle = 0; cycle < 20; cycle++) {
        var days = RotationService.pairs(exercises, new Random(round * 100 + cycle));
        assertEquals(8, days.size());
        assertEquals(16, days.stream().flatMap(List::stream).distinct().count());
        assertEquals(exercises.stream().sorted().toList(), days.stream().flatMap(List::stream).sorted().toList());
      }
    }
  }

  @Test void rejectsMissingOrRepeatedExercises() {
    List<UUID> exercises = new ArrayList<>();
    for (int i = 0; i < 16; i++) exercises.add(UUID.randomUUID());
    assertThrows(IllegalArgumentException.class, () -> RotationService.pairs(exercises.subList(0, 15), new Random()));
    exercises.set(15, exercises.get(0));
    assertThrows(IllegalArgumentException.class, () -> RotationService.pairs(exercises, new Random()));
  }

  @Test void calendarClosesAtClosingTimeAndOnSunday() {
    var calendar = new OperatingCalendar("MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY", "06:00", "22:00");
    var zone = OperatingCalendar.ZONE;
    assertFalse(calendar.isOpen(LocalDate.of(2026, 10, 18).atTime(12, 0).atZone(zone)));
    assertFalse(calendar.isOpen(LocalDate.of(2026, 10, 19).atTime(5, 59).atZone(zone)));
    assertTrue(calendar.isOpen(LocalDate.of(2026, 10, 19).atTime(6, 0).atZone(zone)));
    assertFalse(calendar.isOpen(LocalDate.of(2026, 10, 19).atTime(22, 0).atZone(zone)));
  }
}
