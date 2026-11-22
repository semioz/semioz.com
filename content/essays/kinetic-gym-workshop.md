---
title: "Generating Robotics Tasks with KineticGym Workshop"
description: "How coding agents build and stress-test MuJoCo task families."
draft: true
topics:
  - robotics
  - agents
---

I’ve been building KineticGym as my first project as RL Resident at [Prime Intellect](https://www.primeintellect.ai/) to see how well coding agents can solve robotics tasks while physics keeps running. At first I used existing task families from [LIBERO](https://libero-project.github.io/) and [Embodied First Exam](https://www.embodied-first-exam.ai/) but at some point I started wondering whether the agents could also create tasks in MuJoCo and how I could validate them. In this post, I’ll walk through the task-generation pipeline and show some of the task families they created.

## What a task family looks like

A task family is basically a Python package with a [MuJoCo](https://mujoco.org/) scene, a `sample(level, seed)` function, a success checker, and a reference controller. The level controls how difficult the task is and what values can change, while the seed decides the actual values for each run. So even if you use the same level, changing the seed gives you a different scene with the same difficulty.

Take the conveyor family: objects come down a belt past a Panda arm, and the instruction says which ones go into which bin:

[[conveyor-levels]]

On level 1, the first test seed sends the belt at 0.057 m/s and asks for the yellow cubes. The second test seed is still level 1, but it asks for the blue ones, 8th and 11th, among different distractors. On level 8 the first test seed asks for small blue cubes in bin A and large yellow cubes in bin B, among 16 objects with cylinders and size lookalikes.

[[seed-examples]]

Seeds are split three ways: train (0–1M), dev (1M–2M) and test (2M–3M). Evaluation only uses test seeds, and the gate below runs on its own range, from 9M up.

## Building simulations with Workshop

With Workshop, agents build these task families themselves. I give them a high-level request, like a conveyor that gets faster and more crowded over eight levels, and they write the scene, the sampler, the success check and the reference controller, instead of me building every environment and its variations by hand.

But a simulation that runs isn't necessarily a good task. So every family goes through three checks. An Adversary agent tries to solve it without cameras. An owner-controlled gate then runs the reference controller and those camera-free policies on seeds no agent has seen: the reference has to succeed and the blind policies must not. Finally, an Inspector agent reviews the physics and the success check for problems the gate can't measure. None of this proves a task has no exploits, but it catches bad candidates before I use them.

[How to make a good RL task](https://x.com/GottliebEli/status/2110077216260608037) explains this really well: the prompt, the world and the verifier all have to match what you actually want the model to learn. One way to get there is to let agents write, attack and review a task until they do. That's basically what I tried to build with Workshop.

Here's the architecture:

[[workshop-architecture]]

Each role runs in a fresh container and starts a new conversation. The model roles use high reasoning effort and [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent)'s default RLM max depth of 2. Instead of a turn limit, each run gets a spending and time budget.

- **Architect** (Claude Opus 5.5). Reads the request, runs physics probes in MuJoCo and writes a research report, then builds the family.
- **Adversary** (DeepSeek V4.1 Flash). Gets a copy of the candidate and 90 minutes to write up to six blind policies.
- **Owner gate** (no model). Runs every level on 20 unseen seeds. The reference needs at least 18 successes; the null policy and each Adversary policy at most one. It also checks for leaks and late control ticks.
- **Inspector** (Claude Opus 5.5). Reads the gate report and looks for unrealistic physics, lenient success checks and missing evidence.

If the gate or the Inspector rejects a family, the Architect gets the findings and repairs it. A family that passes is frozen and used for evaluation and RL.

## The task catalog

These are some of the task families from this project. Any request that fits in a MuJoCo scene can go through the same pipeline.

I’ve grouped the [task catalog](https://huggingface.co/datasets/semioz/kinetic-gym-tasks/tree/f1fc115ee40702e5b3b89f0ccd6a4dc67d133b78) into **five families with eight tasks each**, 40 tasks in total.

[[workshop-showcase]]

## How realistic is the physics

The robots come straight from [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie), a library of ready-made robot models. For everything else, the Architect uses the robot maker's published specs where it can, like how far the Panda arm reaches, how much it can lift and how hard its gripper squeezes. Then it runs small tests in MuJoCo before building anything: how fast a marble rolls on a tilted board, how long the crane hook takes to swing, whether a grasp holds.

- **Conveyor:** the belt is a rigid plate sliding on a joint. I only need it to carry objects at the right speed, so a flexible belt wasn't worth simulating.
- **Crane:** the cable is a length limit that doesn't bend or twist. The hook and eye got softer contacts, so the load gets picked up smoothly when the cable goes tight.
- **Marble maze:** the tilt sensors have encoder-like resolution and noise. I wanted that anyway, since it stops the joint angles from giving away where the marble is (more on that below).
- **Goalkeeper:** a built-in controller keeps the G1 balanced, because I wanted the solver to focus on the arms. The physics runs in 0.25 ms steps so each tick fits in realtime.
- **Pinball:** the table isn't modeled on a real machine. It has its own layout, flippers and targets.

All of these choices are written down in each family's manifest, next to its code.

## What can go wrong

Most of the families above didn't pass the gate on the first try. A family can run fine, look right and have a working reference controller, and still not measure what I want. Usually it's one of two things:

1. **Reward hacking.** The success check, which is also the reward during evaluation and RL, says the task is done when it isn't. For example, a check that only looks at where the gripper is and never checks if the cube is actually in the bin. The gate runs the same check, so it can't catch this on its own. That's why the Inspector reads the code.
2. **Shortcuts.** The task really gets done, but without the skill I wanted to test. For example, a catch that works by closing the gripper at a fixed time, so you don't need the camera at all. This is what the Adversary and the gate are for.

Since these families are about seeing and reacting under time pressure, a policy that works without cameras is a red flag. The Adversary tries to find one on purpose, but it doesn't decide anything. The gate runs its blind policies on my side, with legal robot commands and the cameras off.

When solving the tasks, solver agents never sees the scene or the success check. It writes an `act(obs)` program that gets the task text, the robot's sensors (like joint angles) and camera images every tick, and returns the next action while the physics keeps running. I'll go into the solver setup in more detail in the next post.

Anything the program does through this interface is fair: reading joint angles, timing its moves, using the physics. Cheating would be reading things it shouldn't see, like the scene file or the success check, and the program has no access to those. So if a blind policy wins, I take it as a sign that the task doesn't need the skill I'm trying to measure, and I change the task.

## Choosing the Adversary

When I ran DeepSeek V4.1 Flash as a solver, it kept poking at the system instead of solving the task. At one point it planned to send actions before the episode started, so it could calibrate the arm for free. That's annoying in a solver but exactly what you want in an Adversary, so I gave it that job. And poking around the interface you're given isn't cheating anyway.

My favourite example is the marble maze. Two servos tilt the board, and the robot reports their joint angles. The servos aren't perfectly stiff, so the marble's weight pulls the board a tiny bit toward wherever the marble is. DeepSeek compared the measured angles with the ones it commanded and read the marble's position from the difference, turning that bend into a sensor:

```trace
DeepSeek V4.1 Flash | marble maze · Adversary
> Baseline is weak. Now the key: exploit the tilt-sensor side channel. Let me quantify the signal.
>
> Excellent! Roll deflection ≈ -0.0260*y + 0.00074, RMSE 1e-4 rad → equivalent position error 0.0038 m = 3.8 mm. Great! The roll channel is an excellent estimator of marble y (independent of gate).
>
> Excellent! The signal is beautiful. … So the gate's state is trivially observable: the deflection jumps by ~7.3 mrad with a clean ramp.
```

By its own fit, the joint angles alone gave the marble's position to about 4 mm. The marble really reached its target, and reading loads through the joints is something real robots do all the time. DeepSeek just found an easier way in with the sensors I gave it. The problem was on my side: I wanted to measure visual control, and this task didn't need any.

[[marble-blind]]

The gate ran its three policies on 20 unseen seeds per level, with the cameras off:

```trace
Owner gate | marble maze · blind policies, cameras off
$ blind: servo_load.py
= level 1: 7 of 20 · level 2: 4 of 20 · level 3: 1 of 20
$ blind: servo_load_early.py
= level 1: 3 of 20 · level 2: 9 of 20 · level 3: 2 of 20
$ blind: servo_load_nowait.py
= level 1: 6 of 20 · level 2: 4 of 20 · level 3: 3 of 20
```

Anything above 1 in 20 fails, so the gate rejected all three levels. The Architect then fixed the sensing, and the same three policies stopped working.

Pinball broke differently. Nothing leaked, the task just didn't need the camera:

```trace
DeepSeek V4.1 Flash | pinball · Adversary
> Very interesting findings: 1. The ball ALWAYS comes to rest at exactly the same place … That's a **fixed resting spot**, independent of serve height/delay.
>
> HUGE finding: Aim (0.5, 0.7) always hits RED, regardless of seed, exactly one hit. Aim (0.7, 0.5) always hits GREEN. Aim (0.6,0.6) and (1,1) always hit BLUE. … So the aim mapping is perfectly deterministic and seed-independent. The camera provides nothing but "ball is at tee".
```

So its blind policy read the requested order from the task text, waited for the serve and fired the matching aim. The gate confirmed it:

```trace
Owner gate | pinball · level 1 · blind policies, cameras off
$ blind: aim_order.py
= 20 of 20 episodes solved
$ blind: window_edge.py
= 20 of 20 episodes solved
$ blind: contact_latch.py
= 18 of 18 episodes solved
```

The reference also solved 20 of 20, so the family worked fine. It just didn't measure vision, so the gate rejected it.

## What changed after the attacks

Whenever a blind policy got through, I changed the task and ran the gate again.

**Marble maze.** The Architect made the servos stiffer and gave the encoders limited resolution and a bit of noise. Now the marble's weight barely shows up in the joint angles. I reran DeepSeek's three policies on the repaired family and they solved 0 of 10 episodes per level. The family then passed the gate on levels 1–5, and a two-marble version later added levels 6–8.

**Pinball.** Here I had to make the camera matter. The target positions and the lit order now change every episode and aren't written in the task text, so you have to look. Harder levels have smaller targets and need more hits, up to ten with one ball. I rebuilt this family outside Workshop, in assisted coding sessions, so its blind policies came from those sessions too. All eight levels passed: the reference got 18–20 of 20 and every blind policy got 0.

**Humanoid.** This one had the opposite problem. The first design, a step-and-catch task, was too hard even for its own reference, which solved only 3 of 13 scorable episodes. So I turned it into a standing goalkeeper. On levels 1–4 the solver moves two hand targets, and from level 5 it controls the 14 arm joints and has to write its own inverse kinematics. Levels 2–8 were built outside Workshop and passed the same gate.

## What's next

Every family now has eight frozen levels. In the next post I'll look at how well coding agents actually control them, and whether rehearsals and RL make their programs better.
