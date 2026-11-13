package com.evofit;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class EvofitApplication {
  public static void main(String[] args) { SpringApplication.run(EvofitApplication.class, args); }
}
